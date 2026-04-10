import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { publishToBlogger } from '../scripts/publish-external.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
  console.log("Blogger API 테스트 게시물 발송 시작...");
  
  const title = "🚀 EconPedia 자동 퍼블리싱 테스트";
  const htmlContent = "<h1>테스트 성공!</h1><p>이 게시물은 EconPedia 파이프라인에서 <b>Google Blogger API v3</b>를 통해 자동으로 작성되었습니다.</p><p>수익 자동화 파이프라인 가동 준비 완료!</p>";
  const tags = ["테스트", "자동화", "EconPedia"];
  
  try {
    const result = await publishToBlogger(title, htmlContent, tags);
    console.log("테스트 결과:", result);
  } catch (err) {
    console.error("테스트 중 오류 발생:", err);
  }
}

test();
