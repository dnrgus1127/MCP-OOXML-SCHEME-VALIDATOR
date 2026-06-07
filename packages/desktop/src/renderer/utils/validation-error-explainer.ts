/**
 * 검증 엔진의 오류/경고 코드를 사용자 친화적인 한국어 제목과
 * "다음 행동" 안내로 변환한다. (P1-2)
 *
 * 코드 목록은 @ooxml/core의 ValidationErrorCode와 동기화한다.
 * 데스크톱에서만 생기는 합성 코드(XML_PARSE_ERROR)도 포함한다.
 */
export interface ValidationCodeExplanation {
  /** 사용자에게 보여줄 한국어 제목 */
  title: string
  /** 권장 조치 한 줄 (없으면 빈 문자열) */
  action: string
}

const EXPLANATIONS: Record<string, ValidationCodeExplanation> = {
  INVALID_ELEMENT: {
    title: '허용되지 않는 요소',
    action:
      '이 위치에서 허용되는 요소인지 스키마를 확인하고, 잘못된 요소를 제거하거나 올바른 부모 아래로 옮기세요.',
  },
  MISSING_REQUIRED_ELEMENT: {
    title: '필수 요소 누락',
    action: '스키마가 요구하는 필수 자식 요소를 추가하세요.',
  },
  INVALID_ELEMENT_ORDER: {
    title: '요소 순서 오류',
    action: '스키마에 정의된 순서대로 요소를 재배치하세요.',
  },
  TOO_FEW_ELEMENTS: {
    title: '요소 개수 부족',
    action: '최소 발생 횟수(minOccurs)를 만족하도록 요소를 더 추가하세요.',
  },
  TOO_MANY_ELEMENTS: {
    title: '요소 개수 초과',
    action: '최대 발생 횟수(maxOccurs)를 넘는 요소를 제거하세요.',
  },
  INVALID_ATTRIBUTE: {
    title: '허용되지 않는 속성',
    action: '이 요소에 정의되지 않은 속성입니다. 속성 이름을 확인하거나 제거하세요.',
  },
  MISSING_REQUIRED_ATTR: {
    title: '필수 속성 누락',
    action: '스키마가 요구하는 필수 속성을 추가하세요.',
  },
  INVALID_VALUE: {
    title: '값 검증 실패',
    action: '값의 형식이 타입 정의와 맞는지 확인하세요.',
  },
  INVALID_ENUM_VALUE: {
    title: '허용되지 않는 값',
    action: '스키마에 정의된 허용 값 중 하나로 변경하세요.',
  },
  PATTERN_MISMATCH: {
    title: '패턴 불일치',
    action: '값이 요구되는 형식(정규식 패턴)을 따르도록 수정하세요.',
  },
  VALUE_TOO_LONG: {
    title: '값이 너무 김',
    action: '최대 길이(maxLength) 이하로 줄이세요.',
  },
  VALUE_TOO_SHORT: {
    title: '값이 너무 짧음',
    action: '최소 길이(minLength) 이상으로 늘리세요.',
  },
  VALUE_OUT_OF_RANGE: {
    title: '값이 허용 범위를 벗어남',
    action: '허용된 숫자 범위 안의 값으로 변경하세요.',
  },
  UNKNOWN_TYPE: {
    title: '알 수 없는 타입',
    action: '참조한 타입을 스키마에서 찾을 수 없습니다. 타입 이름과 네임스페이스를 확인하세요.',
  },
  INVALID_NAMESPACE: {
    title: '네임스페이스 오류',
    action: '요소·속성의 네임스페이스가 스키마와 일치하는지 확인하세요.',
  },
  INVALID_CONTENT: {
    title: '내용 모델 불일치',
    action: '이 요소가 가질 수 있는 자식 구성과 맞는지 확인하세요.',
  },
  UNEXPECTED_TEXT: {
    title: '예상치 못한 텍스트',
    action: '이 요소는 자식 요소만 가질 수 있습니다. 텍스트를 제거하세요.',
  },
  CHOICE_NOT_SATISFIED: {
    title: '선택(choice) 조건 미충족',
    action: 'choice가 요구하는 선택지 중 하나를 충족하도록 자식 요소를 조정하세요.',
  },
  NON_STANDARD_NAMESPACE: {
    title: '비표준 네임스페이스',
    action:
      '비표준 네임스페이스(예: Excel 호환 패턴)로 작성된 요소입니다. 표준 네임스페이스 사용을 검토하세요.',
  },
  UNKNOWN_NAMESPACE: {
    title: '등록되지 않은 네임스페이스',
    action: '스키마 레지스트리에 없는 네임스페이스입니다. 네임스페이스 선언을 확인하세요.',
  },
  // 데스크톱 합성 코드: XML 파싱 단계 실패
  XML_PARSE_ERROR: {
    title: 'XML 구문 오류',
    action: 'XML이 올바른 형식인지 확인하세요. 닫히지 않은 태그나 잘못된 문자가 없는지 점검하세요.',
  },
}

export function explainValidationCode(code: string): ValidationCodeExplanation {
  return EXPLANATIONS[code] ?? { title: code, action: '' }
}
