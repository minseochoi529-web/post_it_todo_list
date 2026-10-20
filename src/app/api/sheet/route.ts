import { NextResponse } from "next/server";

const EXCLUDED_CONTENTS = [
  "Next.js 프록시 연동 테스트",
  "테스트 메모 저장",
  "테스트 메모",
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

    if (!scriptUrl) {
      return NextResponse.json(
        { status: "error", message: "GOOGLE_SCRIPT_URL not configured" },
        { status: 500 }
      );
    }

    const action = body.action || (body.state === "deleted" ? "delete" : "save");

    // 저장 요청인 경우 내용 검증
    if (action === "save") {
      const trimmedContent = (body.content || "").trim();

      // 1. 빈 내용이거나 작성 중단된 경우 저장 제외
      if (!trimmedContent) {
        return NextResponse.json(
          { status: "ignored", message: "Empty content" },
          { status: 200 }
        );
      }

      // 2. 테스트 문구 제외
      if (EXCLUDED_CONTENTS.some((excluded) => trimmedContent.includes(excluded))) {
        return NextResponse.json(
          { status: "ignored", message: "Test content ignored" },
          { status: 200 }
        );
      }
    }

    // Google Apps Script 웹 앱으로 서버사이드에서 POST 전송
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => null);

    return NextResponse.json({ status: "success", result });
  } catch (error) {
    console.error("Error in api/sheet proxy:", error);
    return NextResponse.json(
      { status: "error", message: String(error) },
      { status: 500 }
    );
  }
}
