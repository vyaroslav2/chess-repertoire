import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const logLine = JSON.stringify(data) + "\n";
    const logFilePath = path.join(process.cwd(), "flightbox.log");
    
    fs.appendFileSync(logFilePath, logLine, "utf-8");
    
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Flightbox API Error:", e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
