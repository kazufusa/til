require 'drb/drb'
require 'pry'

ps = spawn("ruby ./server.rb" )

SERVER_URI = "druby://localhost:8787"
DRb.start_service
timeserver = DRbObject.new_with_uri(SERVER_URI)
10.times.each do
  begin
    puts timeserver.get_current_time
  rescue DRb::DRbConnError => e
    puts e
  ensure
    DRb.stop_service
  end
  sleep 1
end

Process.kill(:INT, ps)
