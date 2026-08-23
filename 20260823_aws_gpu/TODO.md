できます。今回は「AWSの勉強も兼ねつつ、最終的にWindows PCのブラウザからComfyUIを操作して、AWS上のGPUでAnimaの二次元キャラを生成する」までを一本につなげます。

**完成形はこれです。**

```text
Windows PC
    │
    │ AWS CLI + SSM Port Forwarding
    │
    ▼
AWS
┌──────────────────────────────┐
│ EC2 GPU instance             │
│  NVIDIA GPU                  │
│                              │
│  Ubuntu                      │
│    └─ ComfyUI :8188          │
│         ├─ Anima             │
│         ├─ Qwen text encoder │
│         └─ Qwen Image VAE    │
│                              │
│  EBS ← モデル・生成画像      │
└──────────────────────────────┘

ブラウザ
http://localhost:8188
```

Animaは現在ComfyUIにネイティブ対応しており、公式Anima workflowもComfyUI Template Libraryから利用できます。([Hugging Face][1])

## 1. AWSアカウントを作る

まず [AWS公式サイト](https://aws.amazon.com/?utm_source=chatgpt.com) からAWSアカウントを作成します。

メールアドレス、パスワード、連絡先、クレジットカード等を登録します。

ここで最初にやってほしいのが、**rootユーザーを普段使いしないこと**。rootにはMFAを設定します。

その後、IAM Identity Centerを設定して、自分の管理者ユーザーを作る。このユーザーを普段のAWS Console/CLI操作に使います。

最初はAWS学習も兼ねて、

```text
Root
  ↓
IAM Identity Center
  ↓
自分のAdminユーザー
```

くらいで十分です。

---

## 2. リージョンを東京にする

AWS Console右上から、

```text
Asia Pacific (Tokyo)
ap-northeast-1
```

を選択。

Anima用GPUも基本ここに作ります。

---

## 3. いきなりEC2を作らず、GPUクォータを確認

ここがAWS GPU初心者が引っかかりやすいところ。

AWSではGPUインスタンスを作ろうとしても、**GPU系EC2のService Quotaが足りず起動できないことがあります**。

AWS Consoleで、

```text
Service Quotas
  ↓
AWS services
  ↓
Amazon Elastic Compute Cloud (Amazon EC2)
```

を開きます。

G系インスタンス用のOn-Demand quotaを確認します。

今回使いたいのはGPUインスタンスなので、0ならquota increaseを申請します。

最初は **1 GPU動かせればいい**。

---

## 4. EC2を作る

ここでは最初からTerraformにしなくていいです。

**一度AWS Consoleで手動構築して、何を作っているか理解してからTerraform化**する方がAWSの勉強になります。

EC2 → Launch Instance。

OSは、

```text
Ubuntu 24.04 LTS
```

あたりでOK。

GPUはまず**24GB VRAM級**を狙います。

Anima自体は2Bモデルなので、巨大モデルではありません。公式では512²〜1536²までの生成をサポートしています。([Hugging Face][1])

ストレージは最初、

```text
EBS gp3
200 GB
```

くらいを確保しておけばかなり余裕があります。

Animaリポジトリ全体だけでも現在約35GBありますが、実際には必要ファイルだけ取得します。([Hugging Face][2])

---

## 5. SSMを使えるようにする

今回は**SSH鍵を使わない構成**にします。

これがAWSを勉強する意味でも面白いところ。

```text
Windows
   │
   │ AWS Systems Manager
   ▼
EC2
```

EC2にIAM Roleを付けて、

```text
AmazonSSMManagedInstanceCore
```

を許可します。

AWS公式でも、Session Manager接続にはEC2をSSM managed instanceにして、このポリシーを持つIAM Roleを付与する構成が案内されています。([AWS Documentation][3])

これで、

**SSH 22番をInternetに開ける必要すらありません。**

Security GroupのInboundは基本なしでいい。

これはかなりAWSらしい構成です。

---

## 6. WindowsにAWS CLIを入れる

ローカルPCに [AWS CLI](https://aws.amazon.com/cli/?utm_source=chatgpt.com) をインストール。

IAM Identity Centerを使っているなら、

```bash
aws configure sso
```

します。

ログインできたら、

```bash
aws sts get-caller-identity
```

で確認。

自分のAWS Account/User情報が返ればOK。

---

## 7. EC2へ入る

EC2 Consoleからも、

```text
EC2
→ Instances
→ anima
→ Connect
→ Session Manager
→ Connect
```

でターミナルを開けます。

これはAWS公式の標準的な接続方法です。([AWS Documentation][3])

まずここから作業すればいい。

---

## 8. NVIDIA GPUを確認

EC2内で、

```bash
nvidia-smi
```

を実行。

GPU名、VRAM、driver version等が表示されれば第一関門突破。

ここが動かない場合はComfyUIを入れる前にAMI/driver周りを直します。

---

## 9. ComfyUIをインストール

基本構成は、

```bash
sudo apt update

sudo apt install -y \
  git \
  python3 \
  python3-venv \
  python3-pip
```

そして、

```bash
cd /opt
sudo git clone https://github.com/comfyanonymous/ComfyUI.git
sudo chown -R ubuntu:ubuntu ComfyUI

cd ComfyUI

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

GPU環境によってPyTorch/CUDAの組み合わせを合わせる必要があるので、**ここだけは実際に選んだEC2/AMIに合わせて確定**させます。

---

## 10. Animaを入れる

Animaは単一ファイルだけではありません。

公式が指定しているのは、

```text
ComfyUI/
└─ models/
   ├─ diffusion_models/
   │   └─ anima-base-v1.0.safetensors
   │
   ├─ text_encoders/
   │   └─ qwen_3_06b_base.safetensors
   │
   └─ vae/
       └─ qwen_image_vae.safetensors
```

です。([Hugging Face][1])

モデル本体は [CircleStone Labs公式Animaモデルページ](https://huggingface.co/circlestone-labs/Anima?utm_source=chatgpt.com) から取得できます。

この時点では**LoRAもControlNetも入れません**。

まず純正Animaを動かす。

---

## 11. ComfyUIを起動

EC2上で、

```bash
cd /opt/ComfyUI
source .venv/bin/activate

python main.py \
  --listen 127.0.0.1 \
  --port 8188
```

とします。

重要なのが、

```text
127.0.0.1:8188
```

だけでlistenすること。

Internetには公開しません。

---

# 12. Windows → AWSへポートフォワード

ここでSSMを使います。

Windows側から概念的には、

```bash
aws ssm start-session \
  --target i-xxxxxxxxxxxxxxxxx \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8188"],"localPortNumber":["8188"]}'
```

とします。

すると、

```text
Windows localhost:8188
          │
       encrypted
          │
          ▼
       AWS SSM
          │
          ▼
EC2 localhost:8188
          │
          ▼
       ComfyUI
```

になります。

ブラウザを開いて、

```text
http://localhost:8188
```

にアクセス。

**クラウド上にあることをほとんど意識せずComfyUIを操作できます。**

---

# 13. Anima公式Workflowを読み込む

ComfyUIにはAnimaの公式workflowがあります。

```text
Templates
↓
Anima Base v1
↓
Anima Base v1: Text to Image
```

を選択。

ComfyUI公式ドキュメントでもこの方法が案内されています。([GitHub][4])

---

# 14. 最初の二次元キャラを生成

例えば最初は複雑にせず、

```text
1girl, solo,
long black hair,
blue eyes,
white summer dress,
standing on a seaside promenade,
sunset,
anime illustration,
beautiful detailed eyes,
detailed hair,
soft lighting,
highly detailed
```

のようなpromptから始める。

AnimaはDanbooru系タグだけでなく**自然言語promptにも対応**しています。公式モデルカードにはquality tags、年代タグ、meta tags、artist tags、自然言語promptなどのガイドがあります。([Hugging Face][1])

最初の設定は公式推奨に合わせて、

```text
Resolution : 1024 × 1024
Steps      : 30
CFG        : 4
Sampler    : er_sde
```

くらい。

公式推奨範囲は**30〜50 steps、CFG 4〜5**で、`er_sde` はフラットカラーとシャープな線が特徴の標準候補として作者自身が挙げています。([Hugging Face][1])

Queueを押す。

数十秒程度待って、

**AWSのGPUが描いた二次元キャラがWindowsのブラウザに表示されたら完成です。**

---

# 15. 画風を変えて遊ぶ

ここからが本題。

Anima Baseは公式にも、

> maximum flexibility, diversity, and style adherence

を狙ったモデルとして説明されています。([Hugging Face][5])

例えば同じキャラ条件のまま、

```text
1990s anime style,
cel animation,
flat shading
```

とか、

```text
soft watercolor anime illustration,
pastel colors,
delicate thin lines
```

とか、

```text
detailed digital painting,
dramatic lighting,
rich colors
```

などに変えて比較する。

**モデルはAnimaのまま。**

ここではLoRA不要です。

---

# 16. 大量生成するならTurbo

そして今回の目的には**Anima Turboがかなり重要**です。

現在の作者自身の推奨は、まずTurboでpromptを試行すること。

Turboは、

```text
CFG   : 1
Steps : 8〜12
```

で高速生成でき、Baseより多様性は落ちるものの安定性が上がっています。作者もprompt iterationにはTurboから始めることを推奨しています。([Hugging Face][5])

だから最終的には、

```text
妄想
 ↓
Anima Turbo

①②③④
⑤⑥⑦⑧
⑨⑩⑪⑫
⑬⑭⑮⑯

16案生成
 ↓
気に入った構図を選択
 ↓
Base/Aestheticで高品質化
 ↓
Upscale
```

という使い方がいい。

---

# 17. 使い終わったらEC2をSTOPする

**これは絶対忘れない。**

EC2 Console：

```text
Instances
→ anima
→ Instance state
→ Stop instance
```

GPUインスタンスを起動しっぱなしにすると普通にお金が飛びます。

StopすればEC2 compute料金は止まり、EBS等の保存リソースの料金は残ります。

つまり、

```text
平常時

EC2 STOP
EBS
 ├ Anima
 ├ ComfyUI
 ├ workflow
 └ 生成画像


描きたい！

    ↓ Start

GPU ON
    ↓
ComfyUI
    ↓
100枚生成

    ↓ Stop

GPU OFF
```

という運用。

---

# ここまで終わってから拡張する

最初から全部入れない方がいいです。順番としては、

1. **AWSアカウント**
2. **EC2 GPU**
3. **SSM**
4. **ComfyUI**
5. **Anima Base/Turbo**
6. **二次元キャラ生成成功**
7. 画風を色々試す
8. 参考画像 → I2I
9. Style LoRA
10. Character LoRA
11. pose/ControlNet系
12. Upscaler/Detailer
13. S3への自動保存
14. Terraform化

がいい。

特に**⑥までを最初のゴール**にします。AWS、CUDA、ComfyUI、Anima、LoRAを一気に設定すると、失敗したときにどこが原因なのか分からなくなるからです。

そして⑥まで動いたら、次に「参考イラストを渡す → その画風に寄せる」「同じオリジナルキャラを色んな服・ポーズ・シチュエーションで描く」を作れば、当初の目的にかなり近づきます。

なおAnimaの現行ライセンスは**モデル/派生モデルについて非商用ライセンス**なので、モデルやLoRAの利用条件は用途を広げる前に確認してください。([Hugging Face][1])

この作業は途中で止めて再開しやすいので、必要なら「次は⑦から」のように続けられます。

[1]: https://huggingface.co/circlestone-labs/Anima?utm_source=chatgpt.com "circlestone-labs/Anima · Hugging Face"
[2]: https://huggingface.co/circlestone-labs/Anima/tree/main?utm_source=chatgpt.com "circlestone-labs/Anima at main"
[3]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connect-with-systems-manager-session-manager.html?utm_source=chatgpt.com "Connect to your Amazon EC2 instance using Session Manager - Amazon Elastic Compute Cloud"
[4]: https://github.com/Comfy-Org/docs/blob/main/tutorials/image/anima/anima.mdx?utm_source=chatgpt.com "docs/tutorials/image/anima/anima.mdx at main · Comfy-Org/docs · GitHub"
[5]: https://huggingface.co/circlestone-labs/Anima/blame/main/README.md?utm_source=chatgpt.com "README.md · circlestone-labs/Anima at main"
