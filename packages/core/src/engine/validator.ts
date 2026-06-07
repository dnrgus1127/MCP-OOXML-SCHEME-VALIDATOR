import type {
  SchemaRegistry,
  ValidationResult,
  ValidationOptions,
  ValidationErrorCode,
  XsdComplexType,
  XsdSimpleType,
  TypeReference,
} from '../types'
import { hasComplexContent, hasElementContent, hasSimpleContent, isElement, isAny } from '../types'
import {
  CompositorState,
  ElementStackFrame,
  XmlElementInfo,
  createRuntimeContext,
  makeQualifiedName,
  normalizeNamespace,
  resolveNamespaceUri,
  withNamespaceContext,
  isComplexSchemaType,
  FlattenedParticle,
} from '../runtime'
import {
  checkMissingRequiredElementDetails,
  initCompositorState,
  validateCompositorChild,
} from './compositor'
import type { OccurrenceViolation } from './compositor-types'
import { createErrorHandler, ValidationErrorHandler } from './error-handlers'
import { resolveSchemaElementType } from './type-resolver'
import { validateSimpleTypeValue, validateBuiltinOrReferencedType } from './simple-type-validator'
import { validateAttributes, checkRequiredAttributes } from './attribute-validator'
import { setLocale, formatMessage } from '../i18n/format'

const MC_NAMESPACE = 'http://schemas.openxmlformats.org/markup-compatibility/2006'

export class ValidationEngine {
  private context
  private errorHandler!: ValidationErrorHandler

  constructor(
    private registry: SchemaRegistry,
    options?: ValidationOptions
  ) {
    this.context = createRuntimeContext(this.registry)
    if (options) {
      this.context.options = { ...options }
      if (options.locale) {
        setLocale(options.locale)
      }
    }
    this.errorHandler = createErrorHandler(this.context)
  }

  private createResolver(namespaceContext: Map<string, string>, fallbackNamespaceUri?: string) {
    const resolveSchemaPrefixInFallback = (prefix: string): string | undefined => {
      if (!fallbackNamespaceUri) {
        return undefined
      }

      const normalizedFallback = normalizeNamespace(fallbackNamespaceUri)
      const schema =
        this.registry.schemas.get(fallbackNamespaceUri) ??
        this.registry.schemas.get(normalizedFallback)
      return schema?.namespaces.find((ns) => ns.prefix === prefix)?.uri
    }

    return {
      resolveNamespaceUri: (prefix?: string): string => {
        if (!prefix) {
          return fallbackNamespaceUri ?? resolveNamespaceUri(namespaceContext)
        }

        const xmlResult = resolveNamespaceUri(namespaceContext, prefix)
        if (xmlResult) return xmlResult
        const localSchemaResult = resolveSchemaPrefixInFallback(prefix)
        if (localSchemaResult) return localSchemaResult
        return this.registry.resolveSchemaPrefix(prefix) ?? ''
      },
    }
  }

  private resolveSchemaTypeNamespace(schemaType: XsdComplexType | XsdSimpleType | null): string {
    if (!schemaType || !schemaType.name) {
      return ''
    }

    for (const [namespaceUri, schema] of this.registry.schemas.entries()) {
      if (schema.complexTypes.get(schemaType.name) === schemaType) {
        return namespaceUri
      }
      if (schema.simpleTypes.get(schemaType.name) === schemaType) {
        return namespaceUri
      }
    }

    return ''
  }

  startDocument(): void {
    this.context.elementStack = []
    this.context.namespaceStack = [new Map()]
    this.context.ignorableNamespaceStack = [new Set()]
    this.context.errors = []
    this.context.warnings = []
    this.context.idValues = new Set()
    this.context.idrefValues = new Set()
    this.errorHandler = createErrorHandler(this.context)
  }

  startElement(element: XmlElementInfo): void {
    const namespaceContext = withNamespaceContext(
      this.context.namespaceStack,
      element.namespaceDeclarations
    )
    this.context.namespaceStack.push(namespaceContext)

    let matchedParticle: FlattenedParticle | undefined
    const parentFrame = this.context.elementStack[this.context.elementStack.length - 1]
    const resolver = this.createResolver(namespaceContext, parentFrame?.schemaNamespaceUri)
    const ignorableNamespaces = this.resolveIgnorableNamespaces(element, namespaceContext)
    this.context.ignorableNamespaceStack.push(ignorableNamespaces)

    if (parentFrame?.skipValidation) {
      this.context.elementStack.push(this.createSkippedFrame(element))
      return
    }

    const namespaceResolution = this.resolveEffectiveElementNamespace(
      element,
      namespaceContext,
      parentFrame
    )
    let effectiveElement =
      namespaceResolution.namespaceUri === element.namespaceUri
        ? element
        : { ...element, namespaceUri: namespaceResolution.namespaceUri }

    const nonStandardNs = this.resolveNonStandardNamespace(effectiveElement, parentFrame)
    if (nonStandardNs) {
      effectiveElement = { ...effectiveElement, namespaceUri: nonStandardNs.correctedNamespaceUri }
      const policy = this.context.options.nonStandardNamespace ?? 'warn'
      const message = formatMessage(
        'ELEMENT.NON_STANDARD_NAMESPACE',
        element.name,
        nonStandardNs.observedNamespaceUri,
        nonStandardNs.correctedNamespaceUri
      )
      if (policy === 'error') {
        this.errorHandler.pushError('NON_STANDARD_NAMESPACE', message)
      } else {
        this.errorHandler.pushWarning('NON_STANDARD_NAMESPACE', message)
      }
    }

    if (this.isUnsupportedAlternateContent(effectiveElement)) {
      this.context.elementStack.push(this.createSkippedFrame(effectiveElement))
      this.errorHandler.pushWarning(
        'UNSUPPORTED_ALTERNATE_CONTENT',
        formatMessage('ELEMENT.UNSUPPORTED_ALTERNATE_CONTENT')
      )
      return
    }

    if (this.isCompletelyUnknownNamespace(effectiveElement)) {
      const isNewNsContext =
        !parentFrame ||
        normalizeNamespace(parentFrame.namespaceUri) !==
          normalizeNamespace(effectiveElement.namespaceUri)
      if (isNewNsContext) {
        const message = formatMessage(
          'ELEMENT.UNKNOWN_NAMESPACE',
          effectiveElement.name,
          effectiveElement.namespaceUri
        )
        if (this.context.options.strict) {
          this.errorHandler.pushError('UNKNOWN_NAMESPACE', message)
        } else {
          this.errorHandler.pushWarning('UNKNOWN_NAMESPACE', message)
        }
      }
      this.context.elementStack.push(this.createSkippedFrame(effectiveElement))
      return
    }

    let shouldResolveSchema = true

    if (parentFrame?.compositorState) {
      const result = validateCompositorChild(
        effectiveElement.namespaceUri,
        effectiveElement.localName,
        parentFrame.compositorState,
        this.registry,
        resolver
      )

      if (result.skippedRequiredDetails?.length) {
        for (const missingDetail of result.skippedRequiredDetails) {
          this.errorHandler.pushError(
            'MISSING_REQUIRED_ELEMENT',
            this.formatOccurrenceViolationMessage(missingDetail)
          )
        }
      } else if (result.skippedRequired) {
        for (const missing of result.skippedRequired) {
          this.errorHandler.pushError(
            'MISSING_REQUIRED_ELEMENT',
            formatMessage('ELEMENT.MISSING_REQUIRED', missing)
          )
        }
      }

      if (!result.success) {
        const message = result.occurrenceViolation
          ? this.formatOccurrenceViolationMessage(result.occurrenceViolation)
          : formatMessage('ELEMENT.INVALID', effectiveElement.name)
        this.errorHandler.pushError(result.errorCode ?? 'INVALID_CONTENT', message)
      }

      matchedParticle = result.matchedParticle
      shouldResolveSchema = result.success || Boolean(result.matchedParticle)
    }

    // extLst는 lax 와일드카드(<xsd:any processContents="lax">)로 임의의 벤더 확장
    // 콘텐츠를 담는 확장 영역이라 내부를 검증하지 않는다. 부모 compositor가 extLst를
    // 이미 수용/카운트한 뒤이므로, 여기서 skip 프레임을 push해 하위 트리(ext 및 그
    // 미지 네임스페이스 자식들)를 통째로 건너뛴다. 그러지 않으면 CT_Extension의 필수
    // any 파티클이 미충족으로 오탐(MISSING_REQUIRED_ELEMENT)되고, 확장 콘텐츠마다
    // 불필요한 UNKNOWN_NAMESPACE 경고가 발생한다.
    if (this.isExtensionListElement(effectiveElement)) {
      this.context.elementStack.push(this.createSkippedFrame(effectiveElement))
      return
    }

    const isWildcardMatch = Boolean(matchedParticle && isAny(matchedParticle.particle))

    const schemaElement = !shouldResolveSchema
      ? undefined
      : isWildcardMatch
        ? undefined
        : matchedParticle
          ? (this.extractElementFromParticle(
              matchedParticle,
              namespaceContext,
              parentFrame?.schemaNamespaceUri
            ) ??
            this.registry.resolveElement(effectiveElement.namespaceUri, effectiveElement.localName))
          : this.registry.resolveElement(effectiveElement.namespaceUri, effectiveElement.localName)

    const schemaType =
      !shouldResolveSchema || isWildcardMatch
        ? null
        : resolveSchemaElementType(
            schemaElement,
            namespaceContext,
            effectiveElement,
            this.registry,
            this.errorHandler.pushError.bind(this.errorHandler)
          )

    const validatedAttributes = isComplexSchemaType(schemaType)
      ? validateAttributes(
          element.attributes,
          schemaType,
          this.resolveSchemaTypeNamespace(schemaType) || effectiveElement.namespaceUri,
          namespaceContext,
          this.registry,
          this.errorHandler,
          ignorableNamespaces
        )
      : new Set<string>()

    const schemaNamespaceUri =
      this.resolveSchemaTypeNamespace(schemaType) || effectiveElement.namespaceUri

    const frame: ElementStackFrame = {
      elementName: effectiveElement.localName,
      namespaceUri: effectiveElement.namespaceUri,
      schemaNamespaceUri,
      inferredDefaultNamespaceUri: namespaceResolution.inferredDefaultNamespaceUri,
      schemaType,
      compositorState: isComplexSchemaType(schemaType)
        ? initCompositorState(
            schemaType,
            this.registry,
            this.createResolver(namespaceContext, schemaNamespaceUri)
          )
        : null,
      textContent: '',
      validatedAttributes,
    }

    this.context.elementStack.push(frame)

    if (namespaceResolution.warningMessage) {
      this.errorHandler.pushWarning(
        'INFERRED_DEFAULT_NAMESPACE',
        namespaceResolution.warningMessage
      )
    }
  }

  text(text: string): void {
    const frame = this.context.elementStack[this.context.elementStack.length - 1]
    if (!frame || frame.skipValidation) {
      return
    }

    frame.textContent += text
  }

  endElement(element: XmlElementInfo): void {
    const currentFrame = this.context.elementStack[this.context.elementStack.length - 1]
    if (!currentFrame) {
      return
    }

    if (currentFrame.skipValidation) {
      this.context.elementStack.pop()
      this.context.namespaceStack.pop()
      this.context.ignorableNamespaceStack.pop()
      return
    }

    if (currentFrame.compositorState) {
      const endNsContext =
        this.context.namespaceStack[this.context.namespaceStack.length - 1] ?? new Map()
      const missingDetails = checkMissingRequiredElementDetails(
        currentFrame.compositorState,
        this.registry,
        this.createResolver(endNsContext, currentFrame.schemaNamespaceUri)
      )

      for (const missingDetail of missingDetails) {
        this.errorHandler.pushError(
          'MISSING_REQUIRED_ELEMENT',
          this.formatOccurrenceViolationMessage(missingDetail)
        )
      }
    }

    if (isComplexSchemaType(currentFrame.schemaType)) {
      const namespaceContext =
        this.context.namespaceStack[this.context.namespaceStack.length - 1] ?? new Map()
      checkRequiredAttributes(
        currentFrame.schemaType,
        currentFrame,
        currentFrame.schemaNamespaceUri,
        namespaceContext,
        this.registry,
        this.errorHandler
      )
    }

    if (currentFrame.textContent.trim() !== '') {
      this.validateTextContent(currentFrame, currentFrame.textContent)
    } else if (
      !this.context.options.allowWhitespace &&
      isComplexSchemaType(currentFrame.schemaType) &&
      hasElementContent(currentFrame.schemaType.content)
    ) {
      if (currentFrame.textContent.length > 0) {
        this.errorHandler.pushError(
          'UNEXPECTED_TEXT',
          formatMessage('ELEMENT.UNEXPECTED_TEXT.ELEMENT_ONLY')
        )
      }
    }

    this.context.elementStack.pop()
    this.context.namespaceStack.pop()
    this.context.ignorableNamespaceStack.pop()
  }

  endDocument(): ValidationResult {
    const errors = this.context.errors.map((error) => ({
      ...error,
      code: error.code as ValidationErrorCode,
    }))

    return {
      valid: errors.length === 0,
      errors,
      warnings: this.context.options.includeWarnings ? this.context.warnings : undefined,
    }
  }

  private validateTextContent(frame: ElementStackFrame, textContent: string): void {
    const schemaType = frame.schemaType
    if (!schemaType) {
      return
    }

    const nsCtx = this.context.namespaceStack[this.context.namespaceStack.length - 1] ?? new Map()

    if (!isComplexSchemaType(schemaType)) {
      validateSimpleTypeValue(
        textContent.trim(),
        schemaType,
        nsCtx,
        this.registry,
        this.errorHandler,
        frame.schemaNamespaceUri
      )
      return
    }

    if (hasSimpleContent(schemaType.content)) {
      const baseType = schemaType.content.content.base
      validateBuiltinOrReferencedType(
        textContent.trim(),
        baseType,
        nsCtx,
        this.registry,
        this.errorHandler,
        frame.schemaNamespaceUri
      )
      return
    }

    if (hasComplexContent(schemaType.content)) {
      if (!schemaType.content.mixed && !this.context.options.allowWhitespace) {
        this.errorHandler.pushError(
          'UNEXPECTED_TEXT',
          formatMessage('ELEMENT.UNEXPECTED_TEXT.COMPLEX_CONTENT'),
          textContent
        )
      }
    }
  }

  private formatOccurrenceViolationMessage(violation: OccurrenceViolation): string {
    if (violation.kind === 'tooMany') {
      if (violation.maxOccurs === 'unbounded') {
        return formatMessage('ELEMENT.INVALID', violation.elementName)
      }

      return formatMessage(
        'ELEMENT.COUNT_EXCEEDED',
        violation.elementName,
        violation.maxOccurs,
        violation.actualCount - violation.maxOccurs,
        violation.actualCount
      )
    }

    if (violation.minOccurs === 1 && violation.maxOccurs === 1) {
      return formatMessage('ELEMENT.MISSING_REQUIRED', violation.elementName)
    }

    return formatMessage(
      'ELEMENT.COUNT_SHORTAGE',
      violation.elementName,
      violation.minOccurs,
      violation.minOccurs - violation.actualCount,
      violation.actualCount
    )
  }

  /**
   * Excel 호환 패턴 감지: parent compositor가 허용하는 element 중
   * 같은 localName을 가진 다른 namespace가 정확히 1개 있으면 그것으로 보정
   */
  private resolveNonStandardNamespace(
    effectiveElement: XmlElementInfo,
    parentFrame?: ElementStackFrame
  ): { correctedNamespaceUri: string; observedNamespaceUri: string } | undefined {
    if (!parentFrame?.compositorState) return undefined

    const observedQualifiedName = makeQualifiedName(
      effectiveElement.namespaceUri,
      effectiveElement.localName
    )

    const allowed = this.collectAllAllowedNames(parentFrame.compositorState)
    if (allowed.size === 0) return undefined
    if (allowed.has(observedQualifiedName)) return undefined

    const observedNormalizedNs = normalizeNamespace(effectiveElement.namespaceUri)
    const candidates = new Set<string>()
    for (const allowedName of allowed) {
      const colonIdx = allowedName.lastIndexOf(':')
      if (colonIdx === -1) continue
      const allowedNs = allowedName.substring(0, colonIdx)
      const allowedLocal = allowedName.substring(colonIdx + 1)
      if (allowedLocal === effectiveElement.localName && allowedNs !== observedNormalizedNs) {
        candidates.add(allowedNs)
      }
    }

    if (candidates.size !== 1) return undefined

    return {
      correctedNamespaceUri: Array.from(candidates)[0]!,
      observedNamespaceUri: effectiveElement.namespaceUri,
    }
  }

  private collectAllAllowedNames(state: CompositorState): Set<string> {
    const out = new Set<string>()
    for (const fp of state.flattenedParticles) {
      if (fp.allowedNames) {
        for (const name of fp.allowedNames) out.add(name)
      }
    }
    return out
  }

  private resolveEffectiveElementNamespace(
    element: XmlElementInfo,
    namespaceContext: Map<string, string>,
    parentFrame?: ElementStackFrame
  ): {
    namespaceUri: string
    inferredDefaultNamespaceUri?: string
    warningMessage?: string
  } {
    if (element.namespaceUri || element.name !== element.localName) {
      return { namespaceUri: element.namespaceUri }
    }

    if (parentFrame?.inferredDefaultNamespaceUri && !element.namespaceDeclarations?.has('')) {
      return {
        namespaceUri: parentFrame.inferredDefaultNamespaceUri,
        inferredDefaultNamespaceUri: parentFrame.inferredDefaultNamespaceUri,
      }
    }

    if (parentFrame) {
      return { namespaceUri: element.namespaceUri }
    }

    const inferredNamespaceUri = this.inferNamespaceFromDeclaredPrefixes(
      element.localName,
      namespaceContext
    )
    if (!inferredNamespaceUri) {
      return { namespaceUri: element.namespaceUri }
    }

    return {
      namespaceUri: inferredNamespaceUri,
      inferredDefaultNamespaceUri: inferredNamespaceUri,
      warningMessage: formatMessage(
        'ELEMENT.INFERRED_DEFAULT_NAMESPACE',
        element.localName,
        inferredNamespaceUri
      ),
    }
  }

  private inferNamespaceFromDeclaredPrefixes(
    localName: string,
    namespaceContext: Map<string, string>
  ): string | undefined {
    const candidates = new Map<string, string>()

    for (const [prefix, namespaceUri] of namespaceContext.entries()) {
      if (!namespaceUri || prefix === '' || prefix === 'xml' || prefix === 'xmlns') {
        continue
      }

      if (!this.registry.resolveElement(namespaceUri, localName)) {
        continue
      }

      const normalizedNamespaceUri = normalizeNamespace(namespaceUri)
      if (!candidates.has(normalizedNamespaceUri)) {
        candidates.set(normalizedNamespaceUri, namespaceUri)
      }
    }

    if (candidates.size !== 1) {
      return undefined
    }

    return Array.from(candidates.values())[0]
  }

  private isUnsupportedAlternateContent(element: XmlElementInfo): boolean {
    return (
      normalizeNamespace(element.namespaceUri) === MC_NAMESPACE &&
      element.localName === 'AlternateContent'
    )
  }

  /**
   * OOXML 확장 영역인 extLst 요소인지 판별한다.
   * 등록된 스키마 네임스페이스에 속한 'extLst'만 대상으로 하여, 무관한 'extLst'까지
   * 건너뛰지 않도록 한다.
   */
  private isExtensionListElement(element: XmlElementInfo): boolean {
    if (element.localName !== 'extLst') return false
    const normalized = normalizeNamespace(element.namespaceUri)
    return this.registry.schemas.has(element.namespaceUri) || this.registry.schemas.has(normalized)
  }

  private isCompletelyUnknownNamespace(element: XmlElementInfo): boolean {
    const { namespaceUri, localName } = element
    if (!namespaceUri) return false
    const normalized = normalizeNamespace(namespaceUri)
    if (this.registry.schemas.has(namespaceUri) || this.registry.schemas.has(normalized)) {
      return false
    }
    // localName이 등록된 스키마의 최상위 요소로 존재하면 "잘못된 네임스페이스"로 간주해 skip하지 않음
    for (const schema of this.registry.schemas.values()) {
      if (schema.elements.has(localName)) return false
    }
    return true
  }

  private createSkippedFrame(element: XmlElementInfo): ElementStackFrame {
    return {
      elementName: element.localName,
      namespaceUri: element.namespaceUri,
      schemaNamespaceUri: element.namespaceUri,
      schemaType: null,
      compositorState: null,
      textContent: '',
      validatedAttributes: new Set<string>(),
      skipValidation: true,
    }
  }

  private extractElementFromParticle(
    particle: FlattenedParticle,
    namespaceContext: Map<string, string>,
    fallbackNamespaceUri?: string
  ):
    | {
        typeRef?: TypeReference
        inlineComplexType?: XsdComplexType
        inlineSimpleType?: XsdSimpleType
        substitutionGroup?: TypeReference
      }
    | undefined {
    const p = particle.particle

    if (isElement(p)) {
      if (p.ref && !p.typeRef && !p.inlineComplexType && !p.inlineSimpleType) {
        let refNs = p.ref.namespacePrefix
          ? resolveNamespaceUri(namespaceContext, p.ref.namespacePrefix)
          : (fallbackNamespaceUri ?? resolveNamespaceUri(namespaceContext))
        if (!refNs && p.ref.namespacePrefix) {
          refNs = this.registry.resolveSchemaPrefix(p.ref.namespacePrefix) ?? ''
        }
        return this.registry.resolveElement(refNs, p.ref.name)
      }

      return {
        typeRef: p.typeRef,
        inlineComplexType: p.inlineComplexType,
        inlineSimpleType: p.inlineSimpleType,
        substitutionGroup: p.substitutionGroup,
      }
    }

    if (isAny(p)) {
      return undefined
    }

    return undefined
  }

  private resolveIgnorableNamespaces(
    element: XmlElementInfo,
    namespaceContext: Map<string, string>
  ): Set<string> {
    const parentIgnorable =
      this.context.ignorableNamespaceStack[this.context.ignorableNamespaceStack.length - 1] ??
      new Set<string>()
    const current = new Set(parentIgnorable)

    for (const attr of element.attributes) {
      const normalizedNs = normalizeNamespace(attr.namespaceUri ?? '')
      const localName =
        attr.localName ?? (attr.name.includes(':') ? attr.name.split(':')[1] : attr.name)
      if (normalizedNs !== MC_NAMESPACE || localName !== 'Ignorable') {
        continue
      }

      const prefixes = attr.value.split(/\s+/).filter(Boolean)
      for (const prefix of prefixes) {
        const uri = resolveNamespaceUri(namespaceContext, prefix)
        if (uri) {
          current.add(normalizeNamespace(uri))
        }
      }
    }

    return current
  }
}

export function createValidationEngine(
  registry: SchemaRegistry,
  options?: ValidationOptions
): ValidationEngine {
  return new ValidationEngine(registry, options)
}
