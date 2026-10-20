/**
 * Post-it Todo List - 구글 스프레드시트 연동 스크립트
 * 
 * [시트 컬럼: A열 ~ G열만 사용]
 * A열: timestamp (시트기록날짜및시간, 날짜 시간 타입)
 * B열: datetime (메모생성날짜및시간, 날짜 시간 타입)
 * C열: category (메모범주, 문자 타입)
 * D열: content (메모내용, 문자 타입)
 * E열: color (메모색상, 숫자 타입: 1=yellow, 2=pink, 3=green, 4=blue)
 * F열: state (체크 버튼 완료 상태: "완료" / "진행중", 문자 타입)
 * G열: order (메모순서, 숫자 타입)
 */

const SHEET_NAME = "Sheet1";

// ⚠️ 구글 시트에 절대 저장하지 않을 테스트 문구 목록
const EXCLUDED_KEYWORDS = [
  "Next.js 프록시 연동 테스트",
  "테스트 메모 저장",
  "테스트 메모"
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ status: "error", message: "전송된 데이터가 없습니다." });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action || (data.state === "deleted" ? "delete" : "save");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    // 헤더가 없으면 A~G열까지만 헤더 생성
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["timestamp", "datetime", "category", "content", "color", "state", "order"]);
    }

    const rows = sheet.getDataRange().getValues();

    // 1. 메모 삭제 요청인 경우 -> B열(datetime)과 D열(content)로 일치하는 행을 찾아 시트에서 완전 삭제
    if (action === "delete" || data.state === "deleted") {
      const targetContent = (data.content || "").trim();
      const targetDatetime = (data.datetime || "").trim();

      for (let i = rows.length - 1; i >= 1; i--) {
        const rowDatetime = String(rows[i][1]).trim();
        const rowContent = String(rows[i][3]).trim();

        // 내용과 작성일시가 일치하면 삭제
        if (rowContent === targetContent && (!targetDatetime || rowDatetime === targetDatetime)) {
          sheet.deleteRow(i + 1);
          return responseJSON({ status: "success", message: "구글 시트에서 메모가 완전히 삭제되었습니다." });
        }
      }
      return responseJSON({ status: "not_found", message: "삭제할 메모를 찾지 못했습니다." });
    }

    // 2. 순서(order) 일괄 업데이트 요청
    if (action === "reorder" && Array.isArray(data.orders)) {
      // D열(content)을 기준으로 order(G열) 갱신
      data.orders.forEach(item => {
        const itemContent = (item.content || "").trim();
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][3]).trim() === itemContent) {
            sheet.getRange(i + 1, 7).setValue(item.order);
            break;
          }
        }
      });
      return responseJSON({ status: "success", message: "순서가 업데이트되었습니다." });
    }

    // 3. 메모 신규 생성 또는 내용 수정 (저장)
    const content = (data.content || "").trim();

    // 3-1. 내용을 작성하다가 중단하거나 빈 내용인 경우 저장하지 않음
    if (!content) {
      return responseJSON({ status: "ignored", message: "내용이 비어 있어 저장하지 않았습니다." });
    }

    // 3-2. 테스트 문구 제외
    const isExcluded = EXCLUDED_KEYWORDS.some(function(keyword) {
      return content.indexOf(keyword) !== -1;
    });

    if (isExcluded) {
      return responseJSON({
        status: "ignored",
        message: "테스트 문구는 구글 시트에 저장되지 않습니다."
      });
    }

    const now = new Date();
    // A열: timestamp (시트기록날짜및시간)
    const timestamp = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    // B열: datetime (메모생성날짜및시간)
    const datetime = data.datetime || Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    // C열: category (메모범주)
    const category = data.category || "기타";
    // D열: content (메모내용)
    // E열: color (메모색상: 1=yellow, 2=pink, 3=green, 4=blue)
    let colorNum = Number(data.color);
    if (isNaN(colorNum)) {
      const colorMap = { yellow: 1, pink: 2, green: 3, blue: 4 };
      colorNum = colorMap[data.color] || 1;
    }
    // F열: state (체크 버튼을 눌러 완료가 되면 '완료', 미완료면 '진행중')
    const state = (data.completed || data.state === "completed" || data.state === "체크" || data.state === "완료") ? "완료" : "진행중";
    // G열: order (메모순서, 숫자)
    const order = Number(data.order) || 1;

    // 이전 내용(prevContent) 또는 B열/D열로 기존 행 찾기 (수정 또는 상태 토글 시)
    const matchContent = (data.prevContent || content).trim();
    let existingRowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][3]).trim() === matchContent) {
        existingRowIndex = i + 1;
        break;
      }
    }

    if (existingRowIndex > 0) {
      // 기존 행 업데이트 (A열~G열만)
      sheet.getRange(existingRowIndex, 1).setValue(timestamp);
      sheet.getRange(existingRowIndex, 3).setValue(category);
      sheet.getRange(existingRowIndex, 4).setValue(content);
      sheet.getRange(existingRowIndex, 5).setValue(colorNum);
      sheet.getRange(existingRowIndex, 6).setValue(state);
      sheet.getRange(existingRowIndex, 7).setValue(order);
      return responseJSON({ status: "success", message: "메모가 업데이트되었습니다.", row: existingRowIndex });
    } else {
      // 신규 메모 등록: A열부터 G열까지만 저장 (H열 없음!)
      sheet.appendRow([timestamp, datetime, category, content, colorNum, state, order]);
      return responseJSON({ status: "success", message: "메모가 새로 저장되었습니다." });
    }

  } catch (error) {
    return responseJSON({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return responseJSON({ status: "ok", message: "Google Sheet API Ready" });
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
