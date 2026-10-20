/**
 * 구글 앱스 스크립트(Google Apps Script)로 메모 데이터 전송 유틸리티
 */

export interface GoogleSheetPayload {
  action?: "save" | "delete" | "reorder";
  id?: string;
  datetime?: string; // 메모 생성 날짜및시간
  category?: string;
  content?: string;
  prevContent?: string; // 수정 전 메모 내용 (수정 시 매칭용)
  color?: string | number; // 1: yellow, 2: pink, 3: green, 4: blue
  state?: "진행중" | "완료" | "체크" | "deleted";
  completed?: boolean;
  order?: number;
  orders?: { id: string; content: string; order: number }[];
}

export async function sendToGoogleSheet(payload: GoogleSheetPayload): Promise<boolean> {
  // 빈 내용 저장 요청은 전송 제외
  if (payload.action !== "delete" && payload.action !== "reorder") {
    if (!payload.content || !payload.content.trim()) {
      return false;
    }
  }

  try {
    const res = await fetch("/api/sheet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (error) {
    console.error("구글 스프레드시트 데이터 전송 오류:", error);
    return false;
  }
}
