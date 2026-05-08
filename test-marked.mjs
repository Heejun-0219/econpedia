import { marked } from 'marked';
const content = "금융 시장에서 **'내부자 매수(Insider Buy)'**는";
console.log(marked.parse(content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')));
