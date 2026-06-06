/**
 * Curated Element Documentation (수동 큐레이션 설명 사전)
 *
 * OOXML 공식 XSD에는 사람이 읽는 <xsd:documentation>이 거의 없으므로(특히 본문 스키마),
 * 자주 쓰이는 핵심 요소의 설명을 여기서 직접 큐레이션한다.
 * describeSchemaElement(ByPath)가 이 사전을 조회해 결과 DTO의
 * `documentation` / 속성 `description`을 채운다.
 *
 * ── 추가하는 법 ──────────────────────────────────────────────
 * 1) 해당 네임스페이스 그룹(WML/SML/PML/DML 등)의 객체에 `로컬요소명: { ... }` 추가
 * 2) summary는 "이 요소가 무엇을 하는지" 한두 문장. 속성 설명은 attributes에.
 * 3) specRef(선택)는 출처 표기. 정확한 ISO 세부 절 번호가 확실치 않으면 파트 수준만 적는다.
 * 키는 strict 네임스페이스 기준 하나만 등록하면 된다(조회 시 transitional→strict 정규화).
 */

import { normalizeNamespace } from '../runtime'

export interface ElementDocEntry {
  /** 요소가 무엇을 하는지에 대한 설명 */
  summary: string
  /** 속성명 → 설명 */
  attributes?: Record<string, string>
  /** 출처 표기 (예: 'ISO/IEC 29500-1 §17 WordprocessingML') */
  specRef?: string
}

// strict 네임스페이스 (transitional은 조회 시 normalizeNamespace로 매핑됨)
const WML = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
const SML = 'http://purl.oclc.org/ooxml/spreadsheetml/main'
const PML = 'http://purl.oclc.org/ooxml/presentationml/main'
const DML = 'http://purl.oclc.org/ooxml/drawingml/main'

const WML_REF = 'ISO/IEC 29500-1 §17 WordprocessingML'
const SML_REF = 'ISO/IEC 29500-1 §18 SpreadsheetML'
const PML_REF = 'ISO/IEC 29500-1 §19 PresentationML'
const DML_REF = 'ISO/IEC 29500-1 §20 DrawingML'

const wmlDocs: Record<string, ElementDocEntry> = {
  document: {
    summary: '워드 문서의 루트 요소. 문서 본문(body)을 담는다.',
    specRef: WML_REF,
  },
  body: {
    summary:
      '문서 본문. 문단(p)·표(tbl) 등 블록 레벨 콘텐츠와 마지막 구역 속성(sectPr)을 포함한다.',
    specRef: WML_REF,
  },
  p: {
    summary: '문단(paragraph). 텍스트 런(r)과 문단 속성(pPr)을 담는 기본 블록 단위다.',
    specRef: WML_REF,
  },
  pPr: {
    summary: '문단 속성. 정렬·들여쓰기·간격·스타일 등 문단 수준 서식을 정의한다.',
    specRef: WML_REF,
  },
  r: {
    summary: '런(run). 동일한 문자 서식을 공유하는 텍스트 조각이다.',
    specRef: WML_REF,
  },
  rPr: {
    summary: '런 속성. 글꼴·크기·굵기·기울임·색 등 문자 수준 서식을 정의한다.',
    specRef: WML_REF,
  },
  t: {
    summary: '런 안의 실제 텍스트 데이터. 앞뒤 공백을 보존하려면 xml:space="preserve"를 쓴다.',
    attributes: {
      space: '공백 처리 방식. preserve면 앞뒤 공백을 그대로 유지한다.',
    },
    specRef: WML_REF,
  },
  jc: {
    summary: '문단(또는 표)의 가로 정렬을 지정한다.',
    attributes: { val: '정렬 방식. left/center/right/both(양쪽 정렬) 등.' },
    specRef: WML_REF,
  },
  b: { summary: '굵게(bold). val을 생략하면 켜짐으로 간주한다.', specRef: WML_REF },
  i: { summary: '기울임(italic). val을 생략하면 켜짐으로 간주한다.', specRef: WML_REF },
  u: {
    summary: '밑줄(underline).',
    attributes: { val: '밑줄 종류. single/double/none 등.' },
    specRef: WML_REF,
  },
  sz: {
    summary: '글꼴 크기. 단위는 half-point(반 포인트)이므로 24면 12pt다.',
    attributes: { val: '크기(half-point 단위).' },
    specRef: WML_REF,
  },
  color: {
    summary: '글자 색.',
    attributes: { val: '색상 hex(RRGGBB) 또는 auto.' },
    specRef: WML_REF,
  },
  rFonts: {
    summary: '런에 사용할 글꼴 패밀리를 지정한다(ascii/hAnsi/eastAsia 등).',
    specRef: WML_REF,
  },
  ind: { summary: '문단 들여쓰기(왼쪽/오른쪽/첫 줄 등). 단위는 twip.', specRef: WML_REF },
  spacing: { summary: '줄 간격 및 문단 앞뒤 간격을 지정한다.', specRef: WML_REF },
  pStyle: {
    summary: '문단에 적용할 스타일 ID 참조.',
    attributes: { val: '스타일 정의의 ID.' },
    specRef: WML_REF,
  },
  rStyle: {
    summary: '런에 적용할 문자 스타일 ID 참조.',
    attributes: { val: '스타일 정의의 ID.' },
    specRef: WML_REF,
  },
  br: {
    summary: '나눔 문자. 줄/페이지/단 나눔을 표현한다.',
    attributes: { type: '나눔 종류. page/column/textWrapping.' },
    specRef: WML_REF,
  },
  tab: { summary: '탭 문자(런 안의 탭 정지점으로 이동).', specRef: WML_REF },
  tbl: { summary: '표(table). 행(tr)들과 표 속성(tblPr)을 담는다.', specRef: WML_REF },
  tr: { summary: '표의 행(table row). 셀(tc)들을 담는다.', specRef: WML_REF },
  tc: { summary: '표의 셀(table cell). 셀 안에 문단 등 콘텐츠가 들어간다.', specRef: WML_REF },
  tblPr: { summary: '표 속성(너비·테두리·정렬 등).', specRef: WML_REF },
  trPr: { summary: '행 속성(행 높이 등).', specRef: WML_REF },
  tcPr: { summary: '셀 속성(너비·병합·테두리·배경 등).', specRef: WML_REF },
  sectPr: {
    summary: '구역(section) 속성. 용지 크기·여백·머리글/바닥글 참조 등을 정의한다.',
    specRef: WML_REF,
  },
}

const smlDocs: Record<string, ElementDocEntry> = {
  worksheet: { summary: '워크시트의 루트 요소.', specRef: SML_REF },
  sheetData: { summary: '시트의 셀 데이터 컨테이너. 행(row)들을 담는다.', specRef: SML_REF },
  row: {
    summary: '워크시트의 한 행. 셀(c)들을 담는다.',
    attributes: { r: '행 번호(1부터).', spans: '이 행에서 사용된 열 범위.' },
    specRef: SML_REF,
  },
  c: {
    summary: '셀(cell). 값(v)·수식(f)·인라인 문자열(is)을 담을 수 있다.',
    attributes: {
      r: '셀 참조(A1 형식).',
      t: '값 타입. n(숫자)/s(공유문자열)/str(수식문자열)/inlineStr/b(불리언)/e(오류).',
      s: '셀 서식(cellXfs) 인덱스.',
    },
    specRef: SML_REF,
  },
  v: {
    summary: '셀의 값. t에 따라 숫자 또는 공유문자열 인덱스 등으로 해석된다.',
    specRef: SML_REF,
  },
  f: { summary: '셀 수식. 결과 값은 보통 형제 v에 캐시된다.', specRef: SML_REF },
  is: {
    summary: '셀에 직접 저장된 인라인 문자열(공유문자열 테이블을 쓰지 않을 때).',
    specRef: SML_REF,
  },
  cols: { summary: '열 정의 묶음(너비·스타일 등).', specRef: SML_REF },
  col: {
    summary: '열 또는 열 범위의 속성(너비·숨김 등).',
    attributes: { min: '시작 열 번호.', max: '끝 열 번호.', width: '열 너비.' },
    specRef: SML_REF,
  },
  mergeCells: { summary: '병합된 셀 범위들의 묶음.', specRef: SML_REF },
  mergeCell: {
    summary: '하나의 병합 셀 범위.',
    attributes: { ref: '병합 범위(A1:B2 형식).' },
    specRef: SML_REF,
  },
}

const pmlDocs: Record<string, ElementDocEntry> = {
  presentation: { summary: '프레젠테이션의 루트 요소(슬라이드/마스터 목록 등).', specRef: PML_REF },
  sld: { summary: '슬라이드. 공통 슬라이드 데이터(cSld)를 담는다.', specRef: PML_REF },
  cSld: { summary: '공통 슬라이드 데이터. 도형 트리(spTree) 등을 포함한다.', specRef: PML_REF },
  spTree: { summary: '도형 트리. 슬라이드 위의 도형(sp)·그림·그룹을 담는다.', specRef: PML_REF },
  sp: {
    summary: '도형(shape). 도형 속성(spPr)과 텍스트 본문(txBody)을 가질 수 있다.',
    specRef: PML_REF,
  },
  txBody: { summary: '도형의 텍스트 본문. DrawingML 문단(a:p)을 담는다.', specRef: PML_REF },
  nvSpPr: { summary: '도형의 비시각적 속성(이름·ID 등).', specRef: PML_REF },
  spPr: { summary: '도형의 시각적 속성(채우기·외곽선·기하·변형 등).', specRef: PML_REF },
}

const dmlDocs: Record<string, ElementDocEntry> = {
  solidFill: {
    summary: '단색 채우기. 안에 색(srgbClr/schemeClr 등)을 지정한다.',
    specRef: DML_REF,
  },
  srgbClr: {
    summary: 'sRGB 색(RRGGBB hex).',
    attributes: { val: '색상 hex(RRGGBB).' },
    specRef: DML_REF,
  },
  schemeClr: {
    summary: '테마 색 참조(테마의 색 슬롯을 가리킨다).',
    attributes: { val: '테마 색 이름. accent1/dk1/lt1/tx1 등.' },
    specRef: DML_REF,
  },
  ln: { summary: '선/외곽선 속성(너비·색·대시 등).', specRef: DML_REF },
  prstGeom: {
    summary: '미리 정의된 도형 기하(preset geometry).',
    attributes: { prst: '도형 종류. rect/ellipse/roundRect 등.' },
    specRef: DML_REF,
  },
  xfrm: { summary: '2D 변형. 위치(off)·크기(ext)·회전·뒤집기를 정의한다.', specRef: DML_REF },
  off: {
    summary: '오프셋(위치). 단위는 EMU.',
    attributes: { x: 'X 좌표(EMU).', y: 'Y 좌표(EMU).' },
    specRef: DML_REF,
  },
  ext: {
    summary: '범위(크기). 단위는 EMU.',
    attributes: { cx: '너비(EMU).', cy: '높이(EMU).' },
    specRef: DML_REF,
  },
  p: { summary: 'DrawingML 텍스트 문단(도형 텍스트 본문 안의 문단).', specRef: DML_REF },
  r: { summary: 'DrawingML 텍스트 런(동일 서식의 텍스트 조각).', specRef: DML_REF },
  t: { summary: 'DrawingML 런의 실제 텍스트 데이터.', specRef: DML_REF },
}

const DOCS_BY_NAMESPACE = new Map<string, Record<string, ElementDocEntry>>([
  [WML, wmlDocs],
  [SML, smlDocs],
  [PML, pmlDocs],
  [DML, dmlDocs],
])

/** 큐레이션된 요소 설명을 조회한다(없으면 undefined). transitional ns도 자동 정규화. */
export function getElementDoc(
  namespaceUri: string,
  localName: string
): ElementDocEntry | undefined {
  const normalized = normalizeNamespace(namespaceUri)
  return DOCS_BY_NAMESPACE.get(normalized)?.[localName]
}

/** 큐레이션된 속성 설명을 조회한다(없으면 undefined). */
export function getAttributeDoc(
  namespaceUri: string,
  localName: string,
  attributeName: string
): string | undefined {
  return getElementDoc(namespaceUri, localName)?.attributes?.[attributeName]
}
