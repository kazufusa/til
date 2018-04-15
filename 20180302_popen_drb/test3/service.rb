require 'drb/drb'
require 'drb/extserv'

# サービスを表すクラス
class Service
  include DRb::DRbUndumped

  def initialize(service_name)
    @service_name = service_name
  end

  def hello
    "You invoke #{@service_name}"
  end
end

puts "Start #{ARGV[0]}"
# ARGV の最後2つを除いた部分は ExtServManager.command で
# 指定した引数が渡される
front = Service.new(ARGV[0])

# 通信のため drb を起動する
# ポート番号に 0 を指定すると ephemeral port から適当なポート番号が
# 選ばれる
server = DRb::DRbServer.new("druby://localhost:0", front)

# ARGV の最後の2つと DRbServer オブジェクトを ExtServ.new に渡す。
# これによってブローカープロセスにサービスの
# 窓口となる ExtServ オブジェクトを渡す
es = DRb::ExtServ.new(ARGV[1], ARGV[2], server)
p es

# サーバスレッドの停止を待つ
DRb.thread.join
# サービスを DRb::ExtServ#stop_service で止めると、サーバスレッドが
# 終了するため、以下の行が実行される
puts "Stop #{ARGV[0]}"
