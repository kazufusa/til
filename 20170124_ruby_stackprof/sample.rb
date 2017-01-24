require 'stackprof'

def a
  `ls -lht`
end

def b(i)
  a
  i + i
end

StackProf.run(mode: :wall, raw: true, out: 'stackprof-sample.dump') do
  i = 1
  1000.times do
    i = b i
  end
end
