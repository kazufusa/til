# AWSでAnima画像生成＋vLLM小説生成環境を構築する手順

今回は、AWSの勉強も兼ねつつ、最終的にWindows PCからAWS上のGPUを利用して、

- ComfyUI + Animaで高品質な二次元キャラクター画像を生成
- 画風を変えて大量生成
- 将来的にLoRA、I2I、Control系を追加
- vLLMでローカルLLMを動かして小説を生成
- 最終的には「小説＋挿絵」の生成環境に発展

させます。

## 完成形

```text
Windows PC
    │
    │ AWS CLI
    │ SSM Port Forwarding
    │
    ▼
AWS
┌────────────────────────────────────┐
│ EC2: g6e.2xlarge                   │
│                                    │
│ NVIDIA L40S                        │
│ GPU VRAM: 48GB級                   │
│ vCPU: 8                            │
│ RAM: 64 GiB                        │
│                                    │
│ Ubuntu 24.04 DLAMI                 │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ ComfyUI :8188                │   │
│ │                              │   │
│ │ Anima Base / Turbo           │   │
│ │ Qwen text encoder            │   │
│ │ Qwen Image VAE               │   │
│ │ LoRA                         │   │
│ │ Control / I2I                │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ vLLM :8000                   │   │
│ │                              │   │
│ │ 日本語LLM                    │   │
│ │ → 小説                       │   │
│ │ → Anima用プロンプト生成      │   │
│ └──────────────────────────────┘   │
│                                    │
│ EBS gp3 500GB                      │
│ ├─ モデル                         │
│ ├─ LoRA                           │
│ ├─ 小説LLM                        │
│ ├─ 参考画像                       │
│ └─ 生成物                         │
└────────────────────────────────────┘

Windows Browser
├─ http://localhost:8188 → ComfyUI
└─ http://localhost:8000 → vLLM API
```

AWS公式ではG6eは生成AI推論やdiffusion model向けのインスタンスで、NVIDIA L40Sを搭載しています。`g6e.2xlarge` はL40S×1、GPUメモリ48GB、8 vCPU、RAM 64GiBです。

24GBのL4ではなくL40S 48GB級にする理由は、Animaだけでなく、量子化した13B前後のLLMをvLLMで動かしたり、LoRA・高解像度化・複数モデルを扱ったりする余裕を持たせるためです。

---

## 1. AWSアカウントを作る

AWS公式サイトからAWSアカウントを作成します。

メールアドレス、パスワード、連絡先、支払い方法などを登録します。

最初に、

```text
Root User
   ↓
MFAを設定
   ↓
以後は普段使いしない
```

とします。

その後、IAM Identity Centerを設定して、自分用の管理者ユーザーを作ります。

```text
Root
  ↓
IAM Identity Center
  ↓
自分のAdminユーザー
```

以後、AWS ConsoleとAWS CLIは基本的にこちらを使います。

---

## 2. リージョンを東京にする

AWS Console右上から、

```text
Asia Pacific (Tokyo)
ap-northeast-1
```

を選択します。

G6eは現在東京リージョンでも展開されています。

---

## 3. GPU EC2のService Quotaを確認する

GPUインスタンスは、新規AWSアカウントだとquota不足で起動できないことがあります。

AWS Consoleから、

```text
Service Quotas
  ↓
AWS services
  ↓
Amazon Elastic Compute Cloud (Amazon EC2)
```

を開きます。

検索欄で、

```text
Running On-Demand G and VT instances
```

を確認します。

`g6e.2xlarge` は8 vCPUなので、少なくとも8 vCPU分必要です。

余裕を持たせて、

```text
16 vCPU
```

程度を申請しておくとよいです。

今回はOn-Demandを使います。

Spotは後で大量バッチ生成用として検討します。

---

## 4. EC2を作る

最初の一回はTerraformではなくAWS Consoleから作ります。

AWSの各リソースの関係を理解してからTerraform化します。

### Instance type

今回は、

```text
g6e.2xlarge
```

を選択します。

スペックは、

```text
GPU     : NVIDIA L40S × 1
GPU RAM : 48GB級
vCPU    : 8
RAM     : 64 GiB
```

です。

`g6e.xlarge` でもGPUは同じですが、CPU RAMが32GiBしかありません。

画像生成だけなら十分ですが、

```text
Anima
+
vLLM
+
モデルロード
+
LoRA
+
ComfyUI custom nodes
```

まで考えて、今回は最初から`g6e.2xlarge`にします。

---

## 5. 普通のUbuntuではなくAWS DLAMIを使う

AMIは普通のUbuntuより、

```text
Deep Learning Base OSS Nvidia Driver GPU AMI
Ubuntu 24.04
```

を選ぶ方が楽です。

AWSの2026年7月版DLAMIには、

```text
Ubuntu 24.04
NVIDIA Driver
CUDA
NVIDIA Container Toolkit
SSM Agent
```

が最初から含まれ、G6eも正式にサポートされています。

これによってCUDAドライバの手動セットアップをかなり減らせます。

---

## 6. ストレージを500GBにする

以前の200GBから増やします。

```text
EBS
Type : gp3
Size : 500 GB
```

を基本とします。

理由は今後、

```text
Anima Base
Anima Turbo
VAE
Text Encoder
LoRA多数
Control系モデル
Upscaler
vLLM用LLM
量子化LLM
参考画像
生成画像
```

が増えていくからです。

200GBだと意外と早く窮屈になります。

500GBならかなり余裕があります。

後からEBS容量は拡張できます。

---

## 7. EC2にIAM Roleを付ける

EC2用IAM Roleを作り、

```text
AmazonSSMManagedInstanceCore
```

を付けます。

これによりSystems Manager Session ManagerからEC2へ接続できます。

将来的にS3へ生成物を保存するなら、このRoleに専用のS3権限も追加します。

例えば、

```text
s3://my-anima/
```

だけ読み書き可能にする形です。

AdministratorAccessはEC2 Roleには付けません。

---

## 8. Security Group

今回はSSHをInternetに公開しません。

Inbound Rulesは、

```text
なし
```

で構いません。

つまり、

```text
22   CLOSED
8188 CLOSED
8000 CLOSED
```

です。

ComfyUIもvLLMも直接Internet公開しません。

Windows PCからSSM port forwardingを使います。

EC2からAWS SSMやHugging Face等へ出ていくためのOutbound通信は許可しておきます。

---

## 9. EC2を起動する

ここまでで、

```text
Region : ap-northeast-1

EC2
g6e.2xlarge

GPU
NVIDIA L40S 48GB級

RAM
64GiB

AMI
AWS Deep Learning Base
Ubuntu 24.04

EBS
gp3 500GB

IAM
AmazonSSMManagedInstanceCore

Security Group
Inboundなし
```

という構成になります。

---

## 10. Session ManagerからEC2に入る

AWS Consoleで、

```text
EC2
→ Instances
→ anima
→ Connect
→ Session Manager
→ Connect
```

を開きます。

ターミナルが表示されれば成功です。

---

## 11. GPUを確認する

EC2で、

```bash
nvidia-smi
```

を実行します。

L40Sが表示されればOKです。

例えば、

```text
NVIDIA L40S
```

と表示されます。

AWSの仕様表では48GBですが、OS側では単位の違いなどにより約44GiBとして表示される場合があります。

---

## 12. WindowsにAWS CLIを入れる

WindowsにAWS CLI v2をインストールします。

IAM Identity Centerを使うので、

```bash
aws configure sso
```

を実行します。

設定後、

```bash
aws sso login
```

そして、

```bash
aws sts get-caller-identity
```

を実行します。

AWS Account IDなどが返れば成功です。

---

# Anima編

## 13. ComfyUIをインストールする

EC2で、

```bash
sudo apt update

sudo apt install -y \
  git \
  python3 \
  python3-venv \
  python3-pip
```

を実行します。

続いて、

```bash
cd /opt

sudo git clone \
  https://github.com/comfyanonymous/ComfyUI.git

sudo chown -R ubuntu:ubuntu ComfyUI

cd ComfyUI

python3 -m venv .venv

source .venv/bin/activate

pip install --upgrade pip

pip install -r requirements.txt
```

とします。

DLAMIを使っているため、NVIDIA driverやCUDAをゼロからインストールする必要はありません。

---

## 14. PyTorchからGPUが見えることを確認する

ComfyUIのvenv内で、

```bash
python -c \
'import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))'
```

を実行します。

期待値：

```text
True
NVIDIA L40S
```

これが出ればComfyUIからGPUを利用できます。

---

## 15. Animaを配置する

Animaでは主に、

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

という構成になります。

最初は、

```text
Anima Base
Text Encoder
VAE
```

だけでいいです。

LoRAやControl系はまだ入れません。

---

## 16. ComfyUIを起動する

```bash
cd /opt/ComfyUI

source .venv/bin/activate

python main.py \
  --listen 127.0.0.1 \
  --port 8188
```

とします。

ポイントは、

```text
127.0.0.1
```

です。

`0.0.0.0`にはしません。

ComfyUIはEC2内部だけで待ち受けます。

---

# WindowsからComfyUIへ接続

## 17. SSM Port Forwardingする

Windows側から、

```bash
aws ssm start-session ^
  --target i-xxxxxxxxxxxxxxxxx ^
  --document-name AWS-StartPortForwardingSession ^
  --parameters "portNumber=8188,localPortNumber=8188"
```

を実行します。

PowerShellの場合は改行せず一行でも構いません。

概念的には、

```text
Windows

localhost:8188
      │
      │ SSM
      ▼
AWS
EC2 localhost:8188
      │
      ▼
ComfyUI
```

です。

ブラウザから、

```text
http://localhost:8188
```

を開きます。

AWS上のComfyUIが表示されます。

---

## 18. Anima公式Workflowを読み込む

ComfyUIで、

```text
Templates
↓
Anima
↓
Text to Image
```

系の公式workflowを読み込みます。

最初はworkflowを改造せず、そのまま画像生成まで通すことを優先します。

---

## 19. 最初の二次元キャラクターを生成する

例えば、

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

程度から開始します。

最初は、

```text
Resolution : 1024 × 1024
Steps      : 30
CFG        : 4
Sampler    : er_sde
```

程度から試します。

Queueを実行します。

画像が表示されれば、

```text
Windows
   ↓
SSM
   ↓
EC2 L40S
   ↓
Anima
   ↓
二次元キャラ
```

まで完成です。

---

# 画風を変える

## 20. Anima単体でスタイルを変える

モデルそのものを変更しなくてもpromptを変更できます。

例えば、

```text
1990s anime style,
traditional cel animation,
flat shading,
retro color palette
```

あるいは、

```text
soft watercolor anime illustration,
pastel palette,
delicate lines,
dreamlike lighting
```

あるいは、

```text
highly detailed modern anime illustration,
rich colors,
dramatic cinematic lighting,
detailed digital painting
```

などです。

まずはAnima単体でどこまで画風を変えられるか確認します。

特定の参考画像群へ強く寄せたくなった段階でStyle LoRAへ進みます。

---

# 大量生成

## 21. Anima Turboを追加する

大量に候補を出す用途では、

```text
Anima Turbo
```

も入れます。

典型的には、

```text
CFG   : 1
Steps : 8〜12
```

程度で高速に候補を作ります。

運用は、

```text
妄想
 ↓

Anima Turbo

① ② ③ ④
⑤ ⑥ ⑦ ⑧
⑨ ⑩ ⑪ ⑫
⑬ ⑭ ⑮ ⑯

 ↓

気に入った構図を選択

 ↓

Anima Base

 ↓

高品質化

 ↓

Upscale / Detailer
```

とします。

L40Sにしたので、こうした大量試行にも24GB L4より余裕があります。

---

# vLLM編

## 22. 小説生成用にvLLMを入れる

ここから今回追加した部分です。

Animaは画像生成モデルなので、小説は別のLLMを使います。

vLLMはLinux + NVIDIA GPUを正式にサポートしており、NVIDIA GPUではcompute capability 7.5以上を要求しています。L40Sはこの条件を満たします。

Animaとは別venvにします。

```bash
sudo mkdir -p /opt/vllm
sudo chown ubuntu:ubuntu /opt/vllm

cd /opt/vllm

python3 -m venv .venv

source .venv/bin/activate

pip install --upgrade pip
pip install vllm
```

---

## 23. 小説用LLMを入れる

最初は13B〜14B程度を基準にします。

```text
L40S 48GB級
```

なら、14B級をFP16/BF16または量子化モデルで扱いやすくなります。

さらに大きい20B〜30B級モデルについても、AWQ/GPTQなどの量子化モデルなら候補になります。

ただし、小説品質はモデルによって大きく変わるので、ここはAnima環境完成後に2026年時点の日本語小説向けOSSモデルを比較して選びます。

---

## 24. vLLMサーバーを起動する

例えば、

```bash
vllm serve <MODEL_NAME> \
  --host 127.0.0.1 \
  --port 8000
```

とします。

すると、

```text
EC2
127.0.0.1:8000
      │
      ▼
vLLM
      │
      ▼
日本語LLM
```

になります。

vLLMはOpenAI互換APIとして利用できます。

---

## 25. WindowsからvLLMにも接続する

別のターミナルで、

```bash
aws ssm start-session ^
  --target i-xxxxxxxxxxxxxxxxx ^
  --document-name AWS-StartPortForwardingSession ^
  --parameters "portNumber=8000,localPortNumber=8000"
```

とします。

するとWindowsから、

```text
http://localhost:8000/v1
```

としてアクセスできます。

構成は、

```text
Windows
│
├─ localhost:8188
│      ↓
│    ComfyUI
│      ↓
│    Anima
│
└─ localhost:8000
       ↓
     vLLM
       ↓
     小説LLM
```

となります。

---

# GPUメモリの扱い

## 26. 最初はAnimaとvLLMを交互に使う

L40S 48GB級なのでかなり余裕がありますが、最初から、

```text
Anima
+
大きなvLLMモデル
```

をVRAMいっぱいに同時ロードする必要はありません。

最初は、

```text
画像を作る
↓
ComfyUI ON
vLLM OFF
```

```text
小説を書く
↓
ComfyUI OFF
vLLM ON
```

でも構いません。

48GBにしたことで、将来的にはモデルサイズやKV cache量を調整しながら同居させる余地があります。

---

# 最終的に作りたい構成

## 27. 小説と画像を連携する

最終的には、

```text
「こういう話が読みたい」
          │
          ▼
        vLLM
          │
          ▼
┌─────────────────────────┐
│ 第1章                   │
│                         │
│ 本文                    │
│                         │
│ 挿絵用シーン記述        │
└────────────┬────────────┘
             │
             ▼
           Anima
             │
             ▼
           挿絵
```

にします。

さらに、

```text
project/
├─ characters/
│   ├─ alice.md
│   └─ yuki.md
│
├─ world/
│   └─ setting.md
│
├─ story/
│   ├─ plot.md
│   ├─ chapter-01.md
│   └─ chapter-02.md
│
├─ references/
│   └─ style/
│
└─ images/
    ├─ character/
    └─ chapters/
```

のように設定を共有すると、

```text
小説の「雪」
      │
      ├──────────────┐
      ▼              ▼
   vLLM            Anima
      │              │
性格・台詞      顔・髪・服装
      │              │
      └──── 同一キャラ ────┘
```

という形にできます。

---

# 28. 参考イラストから画風を学習させる

Anima自体でいろいろな画風を試した後、

```text
「この参考画像群の画風を再現したい」
```

となったら、

```text
参考画像
 ↓
caption / dataset
 ↓
Style LoRA training
 ↓
my-style.safetensors
 ↓
Anima Base + Style LoRA
```

へ進みます。

さらに、

```text
Character LoRA
```

を別に作れば、

```text
Anima Base
 +
Style LoRA
 +
Character LoRA
```

という組み合わせも可能です。

---

# 29. 使い終わったらEC2をStopする

これは重要です。

```text
EC2
→ Instances
→ anima
→ Instance state
→ Stop instance
```

とします。

G6eは強力なGPUインスタンスなので、起動したまま放置しません。

Stop中はEC2 compute料金は発生しませんが、

```text
EBS
スナップショット
S3
```

等の料金は残ります。

運用イメージ：

```text
普段

EC2 STOP

EBS
├─ ComfyUI
├─ Anima
├─ LoRA
├─ vLLM
├─ LLM
├─ workflow
└─ 生成物


描きたい / 小説を書きたい

        ↓

EC2 START

        ↓

SSM接続

        ↓

ComfyUI / vLLM

        ↓

生成

        ↓

EC2 STOP
```

---

# 推奨する実装順序

最初から全部一気に構築しません。

### Phase 1 — AWS GPU環境

1. AWSアカウント作成
2. IAM Identity Center
3. Service Quota
4. `g6e.2xlarge`
5. DLAMI
6. EBS 500GB
7. IAM Role
8. SSM

### Phase 2 — Anima

9. ComfyUI
10. Anima Base
11. 最初の二次元キャラ生成
12. 画風変更
13. Anima Turbo
14. 大量生成

### Phase 3 — 小説

15. vLLM
16. 日本語小説向けLLM
17. WindowsからOpenAI互換APIでアクセス
18. 小説生成

### Phase 4 — 高品質画像

19. I2I
20. Style LoRA
21. Character LoRA
22. Control系
23. Detailer
24. Upscaler

### Phase 5 — 統合

25. キャラクター設定DB
26. 世界設定
27. 小説生成
28. 挿絵シーン抽出
29. Anima prompt生成
30. 大量画像生成
31. VLMによる候補選別

### Phase 6 — AWS化

32. S3保存
33. systemd化
34. Docker化
35. Terraform化
36. Spotによる大量バッチ生成

---

# 今回の最終スペック

```text
Region
  ap-northeast-1 東京

EC2
  g6e.2xlarge

GPU
  NVIDIA L40S × 1
  48GB級 VRAM

CPU
  8 vCPU

RAM
  64 GiB

OS
  AWS Deep Learning Base OSS Nvidia Driver GPU AMI
  Ubuntu 24.04

Storage
  EBS gp3 500GB

Access
  AWS Systems Manager
  SSHポート公開なし

Image
  ComfyUI
  Anima Base
  Anima Turbo

Text
  vLLM
  13B〜14B級を基本
  必要に応じて量子化された20B〜30B級も検討

Future
  Style LoRA
  Character LoRA
  I2I
  Control
  Upscale
  S3
  Terraform
```

**この構成なら「Animaを動かす最低限のGPUサーバ」ではなく、「個人用の画像＋小説生成ワークステーション」として育てられます。**
