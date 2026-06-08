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
const CHART = 'http://purl.oclc.org/ooxml/drawingml/chart'

const WML_REF = 'ISO/IEC 29500-1 §17 WordprocessingML'
const SML_REF = 'ISO/IEC 29500-1 §18 SpreadsheetML'
const PML_REF = 'ISO/IEC 29500-1 §19 PresentationML'
const DML_REF = 'ISO/IEC 29500-1 §20 DrawingML'
const CHART_REF = 'ISO/IEC 29500-1 §21.2 DrawingML 차트'

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
  // --- xl/workbook.xml ---
  workbook: {
    summary: '워크북(xl/workbook.xml)의 루트 요소. 시트 목록·정의된 이름·계산 옵션 등을 담는다.',
    specRef: SML_REF,
  },
  fileVersion: {
    summary: '이 파일을 만든 애플리케이션과 빌드 버전 정보.',
    attributes: { appName: '생성 앱 이름.', lastEdited: '마지막 편집 버전.' },
    specRef: SML_REF,
  },
  workbookPr: { summary: '워크북 전역 속성(날짜 체계·계산 모드 등).', specRef: SML_REF },
  bookViews: { summary: '워크북 창 보기(view) 묶음.', specRef: SML_REF },
  workbookView: { summary: '워크북 창의 한 보기(크기·활성 탭 등).', specRef: SML_REF },
  sheets: { summary: '워크북에 포함된 시트 목록.', specRef: SML_REF },
  sheet: {
    summary: '워크북의 한 시트 항목. 실제 시트 내용은 r:id가 가리키는 파트에 있다.',
    attributes: {
      name: '시트 이름(탭에 표시).',
      sheetId: '워크북 내 시트 ID.',
      'r:id': '시트 파트(worksheets/sheetN.xml)를 가리키는 관계 ID.',
      state: '표시 상태. visible/hidden/veryHidden.',
    },
    specRef: SML_REF,
  },
  definedNames: { summary: '정의된 이름(이름 범위) 묶음.', specRef: SML_REF },
  definedName: {
    summary: '정의된 이름(named range). 수식에서 셀 범위를 이름으로 참조한다.',
    attributes: { name: '이름.', localSheetId: '시트 한정 이름일 때의 시트 인덱스.' },
    specRef: SML_REF,
  },
  calcPr: { summary: '계산 옵션(계산 모드·반복 계산 등).', specRef: SML_REF },
  // --- xl/worksheets/sheetN.xml ---
  worksheet: { summary: '워크시트의 루트 요소.', specRef: SML_REF },
  dimension: {
    summary: '시트에서 사용된 셀 범위(A1:기준).',
    attributes: { ref: '사용 범위(A1:E10 형식).' },
    specRef: SML_REF,
  },
  sheetViews: { summary: '워크시트 보기(view) 묶음.', specRef: SML_REF },
  sheetView: {
    summary: '워크시트의 한 보기(확대율·틀고정·선택 등).',
    attributes: { workbookViewId: '연결된 워크북 보기 인덱스.', tabSelected: '탭 선택 여부.' },
    specRef: SML_REF,
  },
  selection: { summary: '현재 선택 영역/활성 셀.', specRef: SML_REF },
  sheetFormatPr: { summary: '시트 기본 행 높이·열 너비 등 형식 기본값.', specRef: SML_REF },
  pageMargins: {
    summary: '인쇄 여백(인치 단위).',
    attributes: {
      left: '왼쪽 여백.',
      right: '오른쪽 여백.',
      top: '위 여백.',
      bottom: '아래 여백.',
    },
    specRef: SML_REF,
  },
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

const chartDocs: Record<string, ElementDocEntry> = {
  // --- 루트 / 컨테이너 ---
  chartSpace: {
    summary:
      '차트 파트(chartN.xml)의 루트 요소. 차트 본체(chart)·도형 속성(spPr)·텍스트 속성(txPr)·외부 데이터 참조를 담는다.',
    specRef: CHART_REF,
  },
  chart: {
    summary: '차트 본체. 그림 영역(plotArea)·제목(title)·범례(legend)와 표시 옵션을 담는다.',
    specRef: CHART_REF,
  },
  plotArea: {
    summary:
      '그림 영역. 실제 차트 종류(barChart/lineChart 등)와 축(valAx/catAx 등)을 담는 핵심 컨테이너다.',
    specRef: CHART_REF,
  },
  title: {
    summary: '차트 또는 축의 제목. 서식 있는 텍스트(tx)나 배치(layout)를 가질 수 있다.',
    specRef: CHART_REF,
  },
  autoTitleDeleted: {
    summary: '자동 생성되는 기본 제목을 삭제했는지 여부.',
    attributes: { val: '삭제 여부(true/false).' },
    specRef: CHART_REF,
  },
  legend: {
    summary: '범례. 계열·항목의 색과 이름을 표시한다.',
    specRef: CHART_REF,
  },
  legendPos: {
    summary: '범례 위치.',
    attributes: { val: '위치. b(아래)/tr(우상)/l(왼쪽)/r(오른쪽)/t(위).' },
    specRef: CHART_REF,
  },
  legendEntry: {
    summary: '개별 범례 항목(특정 항목 삭제/서식 재정의).',
    specRef: CHART_REF,
  },
  dTable: {
    summary: '데이터 표. 차트 아래에 원본 값을 표 형태로 함께 표시한다.',
    specRef: CHART_REF,
  },
  view3D: {
    summary: '3D 보기 설정. 회전(rotX/rotY)·원근(perspective)·직각 축 여부를 정의한다.',
    specRef: CHART_REF,
  },
  floor: { summary: '3D 차트의 바닥면 서식.', specRef: CHART_REF },
  sideWall: { summary: '3D 차트의 옆벽 서식.', specRef: CHART_REF },
  backWall: { summary: '3D 차트의 뒷벽 서식.', specRef: CHART_REF },

  // --- 차트 종류 ---
  barChart: { summary: '2D 막대/세로 막대 차트.', specRef: CHART_REF },
  bar3DChart: { summary: '3D 막대/세로 막대 차트.', specRef: CHART_REF },
  lineChart: { summary: '2D 꺾은선 차트.', specRef: CHART_REF },
  line3DChart: { summary: '3D 꺾은선 차트.', specRef: CHART_REF },
  pieChart: { summary: '2D 원형 차트.', specRef: CHART_REF },
  pie3DChart: { summary: '3D 원형 차트.', specRef: CHART_REF },
  doughnutChart: { summary: '도넛형 차트(가운데가 비어 있는 원형).', specRef: CHART_REF },
  areaChart: { summary: '2D 영역 차트.', specRef: CHART_REF },
  area3DChart: { summary: '3D 영역 차트.', specRef: CHART_REF },
  scatterChart: { summary: '분산형(XY) 차트. 각 점이 (x,y) 좌표를 가진다.', specRef: CHART_REF },
  bubbleChart: { summary: '거품형 차트. (x,y)에 거품 크기까지 표현한다.', specRef: CHART_REF },
  radarChart: { summary: '방사형(레이더) 차트.', specRef: CHART_REF },
  stockChart: { summary: '주식 차트(고가/저가/시가/종가 등).', specRef: CHART_REF },
  surfaceChart: { summary: '2D 표면(등고선) 차트.', specRef: CHART_REF },
  surface3DChart: { summary: '3D 표면 차트.', specRef: CHART_REF },
  ofPieChart: {
    summary: '원형 대 원형/막대 차트(작은 조각을 보조 차트로 분리).',
    specRef: CHART_REF,
  },

  // --- 차트 종류 공통 옵션 ---
  barDir: {
    summary: '막대 방향.',
    attributes: { val: '방향. bar(가로)/col(세로).' },
    specRef: CHART_REF,
  },
  grouping: {
    summary: '계열 그룹화 방식.',
    attributes: {
      val: '방식. standard/clustered(묶음)/stacked(누적)/percentStacked(100% 누적).',
    },
    specRef: CHART_REF,
  },
  varyColors: {
    summary: '데이터 점마다 색을 다르게 표시할지 여부.',
    attributes: { val: 'true면 점마다 색을 달리한다.' },
    specRef: CHART_REF,
  },
  gapWidth: {
    summary: '막대 사이 간격(막대 너비 대비 백분율).',
    attributes: { val: '간격 백분율(0~500).' },
    specRef: CHART_REF,
  },
  gapDepth: {
    summary: '3D 차트의 계열 간 깊이 간격(백분율).',
    attributes: { val: '깊이 간격 백분율.' },
    specRef: CHART_REF,
  },
  overlap: {
    summary: '같은 분류 내 막대 겹침 정도(백분율).',
    attributes: { val: '겹침 백분율(-100~100).' },
    specRef: CHART_REF,
  },
  firstSliceAng: {
    summary: '원형/도넛 차트의 첫 조각 시작 각도.',
    attributes: { val: '각도(0~360, 12시 기준 시계방향).' },
    specRef: CHART_REF,
  },
  holeSize: {
    summary: '도넛 차트의 가운데 구멍 크기(지름 대비 백분율).',
    attributes: { val: '구멍 크기 백분율(10~90).' },
    specRef: CHART_REF,
  },
  scatterStyle: {
    summary: '분산형 차트의 표시 스타일(점/선).',
    attributes: { val: 'none/line/lineMarker/marker/smooth/smoothMarker.' },
    specRef: CHART_REF,
  },
  radarStyle: {
    summary: '방사형 차트의 표시 스타일.',
    attributes: { val: 'standard/marker/filled.' },
    specRef: CHART_REF,
  },
  ofPieType: {
    summary: 'of-pie 차트의 보조 차트 종류.',
    attributes: { val: 'pie(원형 대 원형)/bar(원형 대 막대).' },
    specRef: CHART_REF,
  },
  splitType: {
    summary: 'of-pie 차트에서 보조 차트로 분리할 기준.',
    attributes: { val: 'auto/cust/percent/pos/val.' },
    specRef: CHART_REF,
  },
  splitPos: { summary: 'of-pie 분리 기준값(splitType에 따라 해석).', specRef: CHART_REF },
  secondPieSize: {
    summary: 'of-pie 차트의 보조 원형 크기(주 원형 대비 백분율).',
    specRef: CHART_REF,
  },
  bubbleScale: {
    summary: '거품 크기 배율(백분율).',
    attributes: { val: '배율 백분율(0~300).' },
    specRef: CHART_REF,
  },
  bubble3D: {
    summary: '거품에 3D 효과를 적용할지 여부.',
    attributes: { val: 'true면 입체 거품.' },
    specRef: CHART_REF,
  },
  showNegBubbles: {
    summary: '음수 값 거품을 표시할지 여부.',
    attributes: { val: 'true면 음수 거품도 표시.' },
    specRef: CHART_REF,
  },
  sizeRepresents: {
    summary: '거품 크기가 나타내는 기준.',
    attributes: { val: 'area(면적)/w(너비).' },
    specRef: CHART_REF,
  },
  wireframe: {
    summary: '표면 차트를 와이어프레임(선)으로 표시할지 여부.',
    attributes: { val: 'true면 와이어프레임.' },
    specRef: CHART_REF,
  },

  // --- 계열(series)과 데이터 ---
  ser: {
    summary: '데이터 계열(series). 한 데이터 묶음의 값·이름·서식을 담는다.',
    specRef: CHART_REF,
  },
  idx: {
    summary: '인덱스(계열·데이터점 등의 0부터의 순번).',
    attributes: { val: '인덱스 값.' },
    specRef: CHART_REF,
  },
  order: {
    summary: '계열의 그리기/표시 순서.',
    attributes: { val: '순서 값(0부터).' },
    specRef: CHART_REF,
  },
  tx: {
    summary: '계열 이름 또는 제목 텍스트. 셀 참조(strRef)나 리터럴 텍스트로 지정한다.',
    specRef: CHART_REF,
  },
  cat: { summary: '항목(분류) 축 데이터. 막대/선 차트의 x축 레이블 값들이다.', specRef: CHART_REF },
  val: { summary: '값(value) 데이터. 계열의 실제 수치 값들이다.', specRef: CHART_REF },
  xVal: { summary: '분산형/거품형 차트의 X 값 데이터.', specRef: CHART_REF },
  yVal: { summary: '분산형/거품형 차트의 Y 값 데이터.', specRef: CHART_REF },
  bubbleSize: { summary: '거품형 차트에서 각 거품의 크기 값 데이터.', specRef: CHART_REF },
  numRef: {
    summary: '숫자 데이터의 셀 참조. 수식(f)과 캐시된 값(numCache)을 담는다.',
    specRef: CHART_REF,
  },
  strRef: {
    summary: '문자 데이터의 셀 참조. 수식(f)과 캐시된 값(strCache)을 담는다.',
    specRef: CHART_REF,
  },
  multiLvlStrRef: {
    summary: '다단계 문자 데이터의 셀 참조(계층형 분류 레이블).',
    specRef: CHART_REF,
  },
  numCache: { summary: '숫자 참조의 캐시 값(파일 저장 시점의 계산 결과).', specRef: CHART_REF },
  strCache: { summary: '문자 참조의 캐시 값.', specRef: CHART_REF },
  multiLvlStrCache: { summary: '다단계 문자 참조의 캐시 값.', specRef: CHART_REF },
  numLit: { summary: '숫자 리터럴 데이터(셀 참조 없이 차트에 직접 저장).', specRef: CHART_REF },
  strLit: { summary: '문자 리터럴 데이터(셀 참조 없이 직접 저장).', specRef: CHART_REF },
  f: { summary: '데이터 참조 수식. 셀 범위를 나타낸다(예: Sheet1!$A$1:$A$5).', specRef: CHART_REF },
  pt: {
    summary: '캐시/리터럴 안의 개별 데이터 점 값.',
    attributes: { idx: '데이터 점 인덱스(0부터).' },
    specRef: CHART_REF,
  },
  v: { summary: '데이터 점(pt)의 실제 값.', specRef: CHART_REF },
  ptCount: {
    summary: '데이터 점 개수.',
    attributes: { val: '점 개수.' },
    specRef: CHART_REF,
  },
  formatCode: { summary: '데이터 값의 숫자 표시 형식 코드(예: 0.00%).', specRef: CHART_REF },
  lvl: { summary: '다단계 문자 캐시의 한 레벨(계층 한 단계의 레이블 묶음).', specRef: CHART_REF },
  smooth: {
    summary: '꺾은선/분산형 선을 부드러운 곡선으로 표시할지 여부.',
    attributes: { val: 'true면 곡선.' },
    specRef: CHART_REF,
  },
  invertIfNegative: {
    summary: '값이 음수일 때 채우기 색을 반전할지 여부.',
    attributes: { val: 'true면 음수 색 반전.' },
    specRef: CHART_REF,
  },

  // --- 데이터 점 / 표식 / 레이블 ---
  dPt: { summary: '데이터 점(data point). 특정 한 점의 개별 서식을 정의한다.', specRef: CHART_REF },
  marker: { summary: '데이터 표식(marker). 점의 모양·크기·색을 정의한다.', specRef: CHART_REF },
  symbol: {
    summary: '표식 기호 종류.',
    attributes: { val: 'circle/square/diamond/triangle/x/star/dash/dot/plus/none 등.' },
    specRef: CHART_REF,
  },
  size: {
    summary: '표식 크기.',
    attributes: { val: '크기(포인트, 2~72).' },
    specRef: CHART_REF,
  },
  explosion: {
    summary: '원형/도넛 조각을 중심에서 분리하는 정도(백분율).',
    attributes: { val: '분리 백분율.' },
    specRef: CHART_REF,
  },
  dLbls: {
    summary: '데이터 레이블 묶음. 계열/차트 전체의 레이블 표시 옵션을 정의한다.',
    specRef: CHART_REF,
  },
  dLbl: { summary: '개별 데이터 레이블(특정 점의 레이블 재정의).', specRef: CHART_REF },
  dLblPos: {
    summary: '데이터 레이블 위치.',
    attributes: { val: 'ctr/inEnd/inBase/outEnd/bestFit/l/r/t/b 등.' },
    specRef: CHART_REF,
  },
  separator: {
    summary: '한 레이블 안 여러 값 사이의 구분 문자(예: 쉼표·줄바꿈).',
    specRef: CHART_REF,
  },
  showLegendKey: {
    summary: '레이블에 범례 표지(색 키)를 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  showVal: {
    summary: '레이블에 값을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  showCatName: {
    summary: '레이블에 항목(분류) 이름을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  showSerName: {
    summary: '레이블에 계열 이름을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  showPercent: {
    summary: '레이블에 백분율을 표시할지 여부(원형/도넛 등).',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  showBubbleSize: {
    summary: '레이블에 거품 크기 값을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  leaderLines: { summary: '데이터 레이블과 점을 잇는 지시선.', specRef: CHART_REF },
  showLeaderLines: {
    summary: '지시선을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },

  // --- 축(axis) ---
  catAx: {
    summary: '항목(분류) 축. 보통 가로 x축으로 분류 레이블을 표시한다.',
    specRef: CHART_REF,
  },
  valAx: { summary: '값 축. 보통 세로 y축으로 수치 눈금을 표시한다.', specRef: CHART_REF },
  dateAx: { summary: '날짜 축. 항목이 날짜일 때 시간 간격 기준으로 표시한다.', specRef: CHART_REF },
  serAx: { summary: '계열 축. 3D 차트에서 계열 방향의 축이다.', specRef: CHART_REF },
  axId: {
    summary: '축 식별자. 차트 종류 요소가 어떤 축을 쓸지 이 ID로 연결한다.',
    attributes: { val: '축 ID 값.' },
    specRef: CHART_REF,
  },
  crossAx: {
    summary: '이 축과 교차하는 상대 축의 ID.',
    attributes: { val: '교차 축 ID.' },
    specRef: CHART_REF,
  },
  axPos: {
    summary: '축 위치.',
    attributes: { val: '위치. l(왼쪽)/r(오른쪽)/t(위)/b(아래).' },
    specRef: CHART_REF,
  },
  crosses: {
    summary: '상대 축이 이 축의 어디서 교차하는지.',
    attributes: { val: 'autoZero/max/min.' },
    specRef: CHART_REF,
  },
  crossesAt: {
    summary: '교차 위치를 특정 값으로 지정.',
    attributes: { val: '교차 값.' },
    specRef: CHART_REF,
  },
  crossBetween: {
    summary: '값 축이 분류 사이/위 중 어디서 교차하는지.',
    attributes: { val: 'between(분류 사이)/midCat(분류 가운데).' },
    specRef: CHART_REF,
  },
  scaling: {
    summary: '축 배율 설정. 최소/최대(min/max)·로그·방향을 정의한다.',
    specRef: CHART_REF,
  },
  orientation: {
    summary: '축 방향.',
    attributes: { val: 'minMax(정방향)/maxMin(역방향).' },
    specRef: CHART_REF,
  },
  min: {
    summary: '축 눈금 최소값.',
    attributes: { val: '최소값.' },
    specRef: CHART_REF,
  },
  max: {
    summary: '축 눈금 최대값.',
    attributes: { val: '최대값.' },
    specRef: CHART_REF,
  },
  logBase: {
    summary: '로그 눈금의 밑.',
    attributes: { val: '로그 밑(2~1000).' },
    specRef: CHART_REF,
  },
  majorGridlines: { summary: '주 눈금선(큰 눈금 위치의 보조선).', specRef: CHART_REF },
  minorGridlines: { summary: '보조 눈금선(작은 눈금 위치의 보조선).', specRef: CHART_REF },
  majorTickMark: {
    summary: '주 눈금 표시 모양.',
    attributes: { val: 'none/in/out/cross.' },
    specRef: CHART_REF,
  },
  minorTickMark: {
    summary: '보조 눈금 표시 모양.',
    attributes: { val: 'none/in/out/cross.' },
    specRef: CHART_REF,
  },
  tickLblPos: {
    summary: '눈금 레이블 위치.',
    attributes: { val: 'nextTo/high/low/none.' },
    specRef: CHART_REF,
  },
  majorUnit: {
    summary: '주 눈금 간격.',
    attributes: { val: '간격 값.' },
    specRef: CHART_REF,
  },
  minorUnit: {
    summary: '보조 눈금 간격.',
    attributes: { val: '간격 값.' },
    specRef: CHART_REF,
  },
  numFmt: {
    summary: '축/레이블의 숫자 표시 형식.',
    attributes: {
      formatCode: '형식 코드(예: #,##0).',
      sourceLinked: '원본 셀 형식을 따를지 여부.',
    },
    specRef: CHART_REF,
  },
  lblOffset: {
    summary: '항목 축 레이블과 축 사이 간격(백분율).',
    attributes: { val: '간격 백분율(0~1000).' },
    specRef: CHART_REF,
  },
  lblAlgn: {
    summary: '항목 축 레이블 정렬.',
    attributes: { val: 'ctr/l/r.' },
    specRef: CHART_REF,
  },
  tickLblSkip: {
    summary: '몇 개 간격마다 눈금 레이블을 표시할지.',
    attributes: { val: '건너뛸 간격(1=모두 표시).' },
    specRef: CHART_REF,
  },
  tickMarkSkip: {
    summary: '몇 개 간격마다 눈금 표시를 그릴지.',
    attributes: { val: '건너뛸 간격.' },
    specRef: CHART_REF,
  },
  baseTimeUnit: {
    summary: '날짜 축의 기본 시간 단위.',
    attributes: { val: 'days/months/years.' },
    specRef: CHART_REF,
  },
  majorTimeUnit: {
    summary: '날짜 축의 주 눈금 시간 단위.',
    attributes: { val: 'days/months/years.' },
    specRef: CHART_REF,
  },
  minorTimeUnit: {
    summary: '날짜 축의 보조 눈금 시간 단위.',
    attributes: { val: 'days/months/years.' },
    specRef: CHART_REF,
  },
  dispUnits: { summary: '값 축 표시 단위(천/백만 등으로 축약 표시).', specRef: CHART_REF },
  dispUnitsLbl: { summary: '표시 단위 레이블(예: "백만").', specRef: CHART_REF },
  builtInUnit: {
    summary: '내장 표시 단위 종류.',
    attributes: { val: 'hundreds/thousands/millions/billions 등.' },
    specRef: CHART_REF,
  },
  custUnit: {
    summary: '사용자 지정 표시 단위 값.',
    attributes: { val: '단위 값.' },
    specRef: CHART_REF,
  },

  // --- 선/막대 보조 요소 ---
  serLines: { summary: '계열선(누적 막대 등에서 계열을 잇는 선).', specRef: CHART_REF },
  hiLowLines: { summary: '고저선(주식/꺾은선에서 최고·최저를 잇는 선).', specRef: CHART_REF },
  dropLines: { summary: '하강선(점에서 축까지 내리는 선).', specRef: CHART_REF },
  upDownBars: { summary: '증감 막대(첫 값과 마지막 값의 차이 막대).', specRef: CHART_REF },
  upBars: { summary: '증가 막대의 서식.', specRef: CHART_REF },
  downBars: { summary: '감소 막대의 서식.', specRef: CHART_REF },
  bandFmts: { summary: '표면 차트 색 띠 서식 묶음.', specRef: CHART_REF },
  bandFmt: { summary: '표면 차트의 한 색 띠 서식.', specRef: CHART_REF },

  // --- 추세선 / 오차 막대 ---
  trendline: { summary: '추세선(데이터 경향을 나타내는 보조선).', specRef: CHART_REF },
  trendlineType: {
    summary: '추세선 종류.',
    attributes: { val: 'exp/linear/log/movingAvg/poly/power.' },
    specRef: CHART_REF,
  },
  trendlineLbl: { summary: '추세선 레이블(수식·R² 등 표시).', specRef: CHART_REF },
  period: {
    summary: '이동 평균 추세선의 구간 수.',
    attributes: { val: '구간 수.' },
    specRef: CHART_REF,
  },
  intercept: {
    summary: '추세선이 y축과 만나는 절편(고정 값).',
    attributes: { val: '절편 값.' },
    specRef: CHART_REF,
  },
  dispRSqr: {
    summary: '추세선에 R² 값을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  dispEq: {
    summary: '추세선에 수식을 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  forward: {
    summary: '추세선을 앞으로 연장할 구간.',
    attributes: { val: '앞 연장 값.' },
    specRef: CHART_REF,
  },
  backward: {
    summary: '추세선을 뒤로 연장할 구간.',
    attributes: { val: '뒤 연장 값.' },
    specRef: CHART_REF,
  },
  errBars: { summary: '오차 막대(데이터 점의 오차 범위 표시).', specRef: CHART_REF },
  errDir: {
    summary: '오차 막대 방향.',
    attributes: { val: 'x/y.' },
    specRef: CHART_REF,
  },
  errBarType: {
    summary: '오차 막대 표시 방향 종류.',
    attributes: { val: 'both/minus/plus.' },
    specRef: CHART_REF,
  },
  errValType: {
    summary: '오차 값 산정 방식.',
    attributes: { val: 'cust/fixedVal/percentage/stdDev/stdErr.' },
    specRef: CHART_REF,
  },
  plus: { summary: '사용자 지정 오차의 양(+) 방향 값.', specRef: CHART_REF },
  minus: { summary: '사용자 지정 오차의 음(-) 방향 값.', specRef: CHART_REF },
  noEndCap: {
    summary: '오차 막대 끝 마개(가로선)를 없앨지 여부.',
    attributes: { val: 'true면 마개 없음.' },
    specRef: CHART_REF,
  },

  // --- 3D / 표면 옵션 ---
  rotX: {
    summary: '3D 차트의 X축(상하) 회전 각도.',
    attributes: { val: '각도(-90~90).' },
    specRef: CHART_REF,
  },
  rotY: {
    summary: '3D 차트의 Y축(좌우) 회전 각도.',
    attributes: { val: '각도(0~360).' },
    specRef: CHART_REF,
  },
  perspective: {
    summary: '3D 차트의 원근감 정도.',
    attributes: { val: '원근 값(0~240).' },
    specRef: CHART_REF,
  },
  rAngAx: {
    summary: '3D 차트 축을 직각으로 고정할지 여부.',
    attributes: { val: 'true면 직각 축.' },
    specRef: CHART_REF,
  },
  depthPercent: {
    summary: '3D 차트 깊이(너비 대비 백분율).',
    attributes: { val: '깊이 백분율(20~2000).' },
    specRef: CHART_REF,
  },
  hPercent: {
    summary: '3D 차트 높이(너비 대비 백분율).',
    attributes: { val: '높이 백분율(5~500).' },
    specRef: CHART_REF,
  },
  thickness: { summary: '표면 차트 벽/바닥의 두께.', specRef: CHART_REF },
  shape: {
    summary: '3D 막대/거품의 입체 모양.',
    attributes: { val: 'cone/coneToMax/box/cylinder/pyramid/pyramidToMax.' },
    specRef: CHART_REF,
  },

  // --- 공통 서식 / 차트 수준 옵션 ---
  spPr: {
    summary: '도형 속성(채우기·외곽선·기하 등). DrawingML 서식을 차트 요소에 적용한다.',
    specRef: CHART_REF,
  },
  txPr: {
    summary: '텍스트 속성(글꼴·정렬 등). 차트 요소의 텍스트 서식을 정의한다.',
    specRef: CHART_REF,
  },
  layout: {
    summary: '배치 정보. 수동 배치(manualLayout) 또는 자동 배치를 담는다.',
    specRef: CHART_REF,
  },
  manualLayout: { summary: '수동 배치. 위치(x,y)·크기(w,h)를 직접 지정한다.', specRef: CHART_REF },
  layoutTarget: {
    summary: '그림 영역 배치 기준(안쪽/바깥쪽).',
    attributes: { val: 'inner/outer.' },
    specRef: CHART_REF,
  },
  roundedCorners: {
    summary: '차트 영역 모서리를 둥글게 할지 여부.',
    attributes: { val: 'true면 둥근 모서리.' },
    specRef: CHART_REF,
  },
  plotVisOnly: {
    summary: '보이는 셀만 차트에 표시할지 여부(숨긴 행/열 제외).',
    attributes: { val: 'true면 보이는 셀만.' },
    specRef: CHART_REF,
  },
  dispBlanksAs: {
    summary: '빈 셀을 차트에서 어떻게 표시할지.',
    attributes: { val: 'gap(공백)/zero(0)/span(이어서).' },
    specRef: CHART_REF,
  },
  showDLblsOverMax: {
    summary: '값 축 최대를 넘는 데이터 레이블도 표시할지 여부.',
    attributes: { val: 'true면 표시.' },
    specRef: CHART_REF,
  },
  overlay: {
    summary: '제목/범례를 그림 영역 위에 겹쳐 배치할지 여부.',
    attributes: { val: 'true면 겹침.' },
    specRef: CHART_REF,
  },
  delete: {
    summary: '해당 요소(축·레이블 등)를 삭제(숨김)할지 여부.',
    attributes: { val: 'true면 삭제.' },
    specRef: CHART_REF,
  },
  style: {
    summary: '차트 기본 스타일 ID(1~48).',
    attributes: { val: '스타일 ID.' },
    specRef: CHART_REF,
  },
  date1904: {
    summary: '1904 날짜 체계를 사용하는지 여부.',
    attributes: { val: 'true면 1904 기준.' },
    specRef: CHART_REF,
  },
  lang: {
    summary: '차트의 기본 언어/로캘.',
    attributes: { val: '언어 태그(예: ko-KR).' },
    specRef: CHART_REF,
  },
  rich: { summary: '서식 있는 텍스트 본문(DrawingML 문단으로 구성).', specRef: CHART_REF },
  externalData: {
    summary: '차트가 참조하는 외부 데이터(워크시트 파트)의 관계 ID.',
    attributes: { 'r:id': '외부 데이터 파트를 가리키는 관계 ID.' },
    specRef: CHART_REF,
  },
  userShapes: { summary: '차트 위에 그린 사용자 도형 파트 참조.', specRef: CHART_REF },
  pivotSource: { summary: '피벗 차트의 원본 피벗 테이블 참조.', specRef: CHART_REF },
  pivotFmts: { summary: '피벗 차트 서식 묶음.', specRef: CHART_REF },
  pivotFmt: { summary: '피벗 차트의 한 서식 항목.', specRef: CHART_REF },
  clrMapOvr: { summary: '차트의 색상 맵 재정의(테마 색 슬롯 매핑 변경).', specRef: CHART_REF },
  pageMargins: {
    summary: '차트 인쇄 여백.',
    attributes: { l: '왼쪽', r: '오른쪽', t: '위', b: '아래' },
    specRef: CHART_REF,
  },
  pageSetup: { summary: '차트 인쇄 페이지 설정(용지·방향 등).', specRef: CHART_REF },
  headerFooter: { summary: '차트 인쇄 시 머리글/바닥글.', specRef: CHART_REF },
  printSettings: { summary: '차트 인쇄 설정 묶음(여백·페이지·머리글 등).', specRef: CHART_REF },
}

const DOCS_BY_NAMESPACE = new Map<string, Record<string, ElementDocEntry>>([
  [WML, wmlDocs],
  [SML, smlDocs],
  [PML, pmlDocs],
  [DML, dmlDocs],
  [CHART, chartDocs],
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
