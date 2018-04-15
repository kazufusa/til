require 'drb/drb'

DRb.start_service
s = DRbObject.new_with_uri("druby://localhost:10234")
s.service(ARGV[0]).stop_service
