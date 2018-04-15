require 'drb/drb'
require 'drb/extservm'

Dir.chdir(File.dirname(__FILE__))
# サービスを起動するコマンドを指定する
# コマンドは文字列配列、もしくは文字列で指定できる
# サブプロセスの起動は Kernel.#spawn でなされる
#
# サブプロセスを起動するときは、ここに指定したパラメータに加えて
# さらに2つのパラメータ(サーバの druby URI とサービス名)が渡されます
DRb::ExtServManager.command["No1"] = %w(ruby service.rb service1)
DRb::ExtServManager.command["No2"] = %w(ruby service.rb service2)

# ExtServManager オブジェクトを生成して
# drb の front object に指定する
s = DRb::ExtServManager.new
DRb.start_service("druby://localhost:10234", s)

# drb のプロセスの終了を待つ
DRb.thread.join
