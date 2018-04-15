require 'drb/drb'
require 'pry'
require 'open3'

# IO.popen("ruby server.rb", 'w+') do |io|
Open3.popen3("ruby server.rb") do |stdin, stdout, stderr|
  SERVER_URI="druby://localhost:8787"
  DRb.start_service
  timeserver = DRbObject.new_with_uri(SERVER_URI)
  10.times.each do
    puts timeserver.get_current_time
    sleep 1
  end
end
