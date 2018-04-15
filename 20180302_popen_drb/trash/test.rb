require 'drb/drb'
require 'open3'
require 'pry'

Open3.popen3("irb") do |stdin, stdout, stderr|
  stdin.puts <<EOT
  require 'drb/drb'
  URI="druby://localhost:8787"
  class TimeServer
    def get_current_time
      return Time.now
    end
  end
  FRONT_OBJECT=TimeServer.new
  DRb.start_service(URI, FRONT_OBJECT, :safe_level => 1)
  DRb.close_server
EOT
  SERVER_URI="druby://localhost:8787"
  DRb.start_service
  timeserver = DRbObject.new_with_uri(SERVER_URI)
  10.times.each do
    puts timeserver.get_current_time
    sleep 1
  end
  DRb.close_service
end

SERVER_URI="druby://localhost:8787"
DRb.start_service
timeserver = DRbObject.new_with_uri(SERVER_URI)
10.times.each do
  puts timeserver.get_current_time
  sleep 1
end
