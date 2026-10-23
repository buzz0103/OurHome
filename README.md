# 우리집 정리

집 매도에 맞춰 가족 4명이 함께 보는 페이지입니다.

- **일정 안내**: 계약일·이사일 같은 일정을 올리고 D-day로 확인
- **물건 나누기**: 집안 물건을 사진과 함께 올리고, 가져갈 사람이 "제가 가져갈게요"로 고르기

데이터는 Supabase에 저장되고, 화면은 GitHub Pages로 공개됩니다. 로그인 없이 링크만 있으면 쓸 수 있습니다.

## 처음 한 번 설정

1. **Supabase 테이블 만들기**: Supabase 대시보드 > SQL Editor에 `supabase/schema.sql` 전체를 붙여넣고 Run을 누릅니다.
2. **키 넣기**: Supabase 대시보드 > Project Settings > API에서 `anon` `public` 키(또는 Publishable key)를 복사해 `resource/js/config.js`의 `SUPABASE_ANON_KEY`에 넣습니다. `service_role` 키는 절대 넣지 않습니다.
3. **GitHub Pages 켜기**: 저장소 Settings > Pages > Branch를 `main` / `(root)`로 저장합니다. 1~2분 뒤 `https://buzz0103.github.io/OurHome/` 에서 열립니다.

## 구조

```
index.html
supabase/schema.sql      ← 테이블·사진 저장소·권한 설정
resource/css/            ← font → reset → pc → tablet → mobile
resource/js/config.js    ← Supabase 주소와 anon 키
resource/js/main.js
```

## 주의

링크와 anon 키는 페이지 소스에 보이므로, 링크를 아는 사람은 누구나 내용을 읽고 고칠 수 있습니다. 가족에게만 링크를 공유해 주세요.
