# context-meter

Claude Code 프롬프트 바로 위에 현재 세션의 컨텍스트 사용량을 막대로 표시하는 mod입니다. 매 턴이 끝날 때마다 갱신됩니다.

```
Context ━━━━━━━━━━━━━━━━━━╸───────────────────── 47%  466k / 1M
```

- 85% 미만: 초록 / 85% 이상: 노랑 / 93% 이상: 빨강
- 85%, 93%를 넘는 순간 토스트로 한 번씩 알립니다. (토스트 문구의 `/handoff`는 별도 mod라서 없다면 `/compact` 또는 새 세션으로 대신하세요.)
- 모델이나 대화 기록에는 아무것도 넣지 않습니다. 화면에만 표시합니다.

## 설치

Claude Code 터미널 세션의 프롬프트에서:

```
/plugin install context-meter --marketplace generalaimaker/context-meter
```

`Add marketplace?` 가 나오면 `y`, 이어서 설치 범위(scope)를 고르면 됩니다. 기본값인 user scope를 고르면 이후 모든 세션에 적용됩니다.

셸에서 설치하려면:

```
claude plugin install context-meter --marketplace generalaimaker/context-meter
```

데스크톱 앱(`/plugin` 이 안 되는 곳)에서는 프롬프트 옆 **+** → **Plugins** → **Add marketplace** 에 `generalaimaker/context-meter` 입력 → **Add plugin**.

## 업데이트

```
claude plugin update context-meter
```
