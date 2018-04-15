require 'drb/drb'

DRb.start_service
s = DRbObject.new_with_uri("druby://localhost:10234")

# No1 と名付けられたサービスを呼び出す
service1 = s.service("No1").front
p service1.hello # => "service1"

# No2 と名付けられたサービスを呼び出す
service2 = s.service("No2").front
p service2.hello # => "service2"
