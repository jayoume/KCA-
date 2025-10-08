# KCA 부산본부 선박 무선국검사 안내 챗봇 (클린 빌드)
- 외부 의존 없음(CDN/폰트/라이브러리 X)
- 로컬 `data.json`만 사용 (웹 검색/LLM 호출 없음)
- 입력창 내부 작은 × 버튼, 연한 블루 그라데이션 배경
- 답변 카드 하단에 `문의처 051-440-1005` 링크

## 사용 방법
1) `data.json`을 실제 데이터로 교체
2) 로컬 테스트
   ```bash
   python -m http.server 8000
   # 브라우저: http://localhost:8000
   ```
3) GitHub Pages 배포: 저장소 루트에 4개 파일 업로드
   - `index.html` `style.css` `app.js` `data.json`
   - Settings → Pages → Deploy from a branch → main / (root)

## 문제 해결
- **응답이 안 보임**: 브라우저 콘솔 오류 확인, `data.json`이 루트에 있는지 확인
- **이전 버전이 뜸**: 강력 새로고침(Ctrl+F5) 또는 파일명에 버전 쿼리 `?v=2` 추가