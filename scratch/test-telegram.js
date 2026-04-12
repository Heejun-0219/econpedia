import { publishToTelegram } from '../scripts/publish-external.js';

async function test() {
  console.log('🚀 텔레그램 알림 테스트 시작...');
  const result = await publishToTelegram(
    '[테스트] EconPedia 시스템 알림',
    'https://econpedia.dedyn.io/blog/test-article'
  );
  console.log(result);
}

test();
