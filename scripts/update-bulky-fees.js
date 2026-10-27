// 관악구 대형폐기물 수수료 표를 받아 resource/js/bulky-fees.js 로 저장
// 실행: node scripts/update-bulky-fees.js
const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://smartclean.gwanak.go.kr/online/bulky/item";
const OUT_FILE = path.join(__dirname, "..", "resource", "js", "bulky-fees.js");
const CATEGORIES = ["가구류", "가전제품", "기타품목", "생활용품"];

async function updateFees() {
    const html = await (await fetch(SOURCE_URL)).text();
    // 페이지 스크립트 안의 "items: [...]" 한 줄에 전체 품목이 들어 있음
    const line = html.split("\n").find((l) => l.trim().startsWith("items: ["));
    if (!line) throw new Error("품목 데이터를 찾지 못했어요. 페이지 구조가 바뀌었는지 확인하세요.");
    const items = JSON.parse(line.trim().replace(/^items:\s*/, "").replace(/,\s*$/, ""));

    const rows = items
        .filter((item) => !item.deleted && CATEGORIES.includes(item.categoryName))
        .map((item) => [CATEGORIES.indexOf(item.categoryName), item.name, item.standard, Math.round(item.price)]);
    const today = new Date().toISOString().slice(0, 10);

    const body = [
        "// 관악구 대형폐기물 수수료 (scripts/update-bulky-fees.js 로 생성, 직접 고치지 마세요)",
        "// 출처: " + SOURCE_URL,
        "const BULKY_FEES = {",
        "    source: " + JSON.stringify(SOURCE_URL) + ",",
        "    updated: " + JSON.stringify(today) + ",",
        "    categories: " + JSON.stringify(CATEGORIES) + ",",
        "    // [분류번호, 품목, 규격, 금액]",
        "    items: [",
        ...rows.map((row) => "        " + JSON.stringify(row) + ","),
        "    ],",
        "};",
        "",
    ].join("\n");
    fs.writeFileSync(OUT_FILE, body);
    console.log(today + " 기준 " + rows.length + "개 품목 저장");
}

updateFees().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
