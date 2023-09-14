
```mermaid
sequenceDiagram
    autonumber
    participant browser as ブラウザ
    participant proxy as プロキシ
    participant identity_platform as identityPlatform
    participant okta as IdP(Okta)
    browser->>+proxy: リクエスト
    Note over proxy: セッション検証→無効
    proxy->>-browser: /auth(認証画面)へリダイレクト
    rect rgb(255, 255, 255, 0.1)
    Note right of browser: Firebase SDKによる認証処理(Popup)
    browser->>identity_platform: 認証リクエスト
    identity_platform->>browser: SAMLリクエストをoktaにリダイレクト
    browser->>okta: SAMLリクエストをoktaにリダイレクト
    okta->>browser: ユーザー認証画面
    browser->>okta: ログイン
    Note right of okta: ログイン成功
    okta->>browser: SAMLレスポンスをACS URLにリダイレクト
    browser->>identity_platform: SAMLレスポンスをACS URLにリダイレクト
    Note right of identity_platform: SAMLレスポンスを検証
    identity_platform->>browser: セッショントークン, CSRFトークン
    end
    browser->>proxy: /persist_idにセッショントークン, CSRFトークンをPOST
    proxy->>browser: アプリケーション画面, Set-Cookie: セッショントークン, CSRFトークン