require 'erb'

def plot(dat, png, xmin, xmax, t="", cbrange="0:0.5")
  template =<<EOS
  set terminal pngcairo nocrop enhanced size 800,600

  # 出力pngファイル名
  set output '#{png}'

  # set rmargin at screen 0.9
  # # set lmargin at screen 0.1
  # set tmargin at screen 0.9
  # set bmargin at screen 0.15

  set pm3d
  set pm3d map corners2color c1

  # set view map
  set size ratio -1
  set grid xtics mxtics ytics mytics lw 1

  # プロットタイトル
  set title '#{t}' offset 0,-0.4

  # ラベル類
  set xlabel 'X[m]'
  set ylabel 'Y[m]' offset -2,0
  set cblabel 'log10(μSv/h)' offset 2,0

  # 緯度範囲
  set xrange[#{xmin}:#{xmax}]
  set grid noxtic

  # 経度範囲
  set yrange[0:5000]
  set cbrange[#{cbrange}]
  #カラーマップのスタイル
  set palette rgbformulae 33,13,10
  #{(xmax-xmin)!=5000?"set cblabel 'log10(μSv/h)' offset -6,10.5 rotate by 0":""}

  # グリッドの書式
  set format x '%.f'
  set format y '%.f'

  splot '-' using 1:2:3 with pm3d notitle lc palette
  #{dat}
EOS
  IO.popen('gnuplot', 'r+') do |io|
    io.puts ERB.new(template, nil, '>').result
    io.close_write
  end
  `convert -trim #{png} #{png}`
end

def compare_plot(dats, png, xmin, xmax, titles, cbrange="0:0.5")
  template =<<EOS
  set terminal pngcairo nocrop enhanced size 1200,600

  # 出力pngファイル名
  set output '#{png}'

  # set rmargin at screen 0.9
  # # set lmargin at screen 0.1
  # set tmargin at screen 0.9
  # set bmargin at screen 0.15

  set pm3d
  set pm3d map corners2color c1

  # set view map
  set size ratio -1

  # プロットタイトル
  # set title '空間線量率推定値'

  # ラベル類
  set xlabel 'X[m]'
  set ylabel 'Y[m]' offset -2,0

  # 緯度範囲
  set xrange[#{xmin}:#{xmax}]
  set grid noxtic

  # 経度範囲
  set yrange[0:5000]
  set cbrange[#{cbrange}]
  #カラーマップのスタイル
  set palette rgbformulae 33,13,10

  # グリッドの書式
  set format x '%.f'
  set format y '%.f'
  set xtics 1000
  set mxtics 10
  set ytics 500
  set mytics 5
  set grid ytics lw 1

  set multiplot
  set lmargin screen 0.09 ; set rmargin screen 0.26
  set tmargin screen 0.9 ; set bmargin screen 0.1 ;
  unset colorbox
  set title '#{titles[0]}' offset 0,-0.4

  splot '-' using 1:2:3 with pm3d notitle lc palette
  #{dats[0]}

  set lmargin screen 0.29 ; set rmargin screen 0.46
  unset ylabel
  set ytics format " "
  set title '#{titles[1]}' offset 0,-0.4
  splot '-' using 1:2:3 with pm3d notitle lc palette
  #{dats[1]}

  set lmargin screen 0.49 ; set rmargin screen 0.66
  set title '#{titles[2]}' offset 0,-0.4
  splot '-' using 1:2:3 with pm3d notitle lc palette
  #{dats[2]}

  set lmargin screen 0.69 ; set rmargin screen 0.86
  set title '#{titles[3]}' offset 0,-0.4
  set colorbox user origin 0.87,0.16 size 0.017,0.68
  set cblabel 'log10(μSv/h)' offset 0,0
  splot '-' using 1:2:3 with pm3d notitle lc palette
  #{dats[3]}
EOS
  IO.popen('gnuplot', 'r+') do |io|
    io.puts ERB.new(template, nil, '>').result
    io.close_write
  end
  `convert -trim #{png} #{png}`
end

def get(dat, diffx, target=3)
  h = {}

  File.open(dat) do |io|
    3.times.each{|| io.gets}
    io.map do |l|
      l = l.strip().split(" ")
      h["#{l[0].to_f + diffx} #{l[1].to_f}"] = {x:l[0].to_f + diffx, y:l[1].to_f ,v: l[target].to_f}
    end
  end

  h
end

def merge(h1, h2, f)
  hm = {}
  points = h1.keys().concat h2.keys()
  points.each do |point|
    if h1[point] and h2[point]
      hm[point] = f.call h1[point], h2[point]
    elsif h1[point]
      hm[point] = h1[point]
    else
      hm[point] = h2[point]
    end
  end

  hm
end

def avg a, b
  h = a.dup
  h[:v] = (a[:v] + b[:v]) / 2
  h
end

def cut a, b
  h = a.dup
  a[:x] < (3500.0 + 5000.0)/2 ? h[:v]=a[:v] : h[:v]=b[:v]
  h
end

def hybrid1 a, b
  h = a.dup
  if a[:x] < 4000
    h[:v] = a[:v]
  elsif a[:x] > 4500
    h[:v] = b[:v]
  else
    h[:v] = (a[:v] + b[:v]) / 2
  end
  h
end

def hybrid2 a, b
  h = a.dup
  if a[:x] < 4100
    h[:v] = a[:v]
  elsif a[:x] > 4400
    h[:v] = b[:v]
  else
    h[:v] = (a[:v] + b[:v]) / 2
  end
  h
end

def diff h, hbase
  h = Marshal.load(Marshal.dump h)
  h.each do |k, v|
    h[k][:v] = h[k][:v] - hbase[k][:v]
  end
  h
end

def h2t h
  texts = h.sort_by{|k, v| v[:x] * 1e10+v[:y]}.map.with_index do |hh, i|
    l = "#{hh[1][:x]} #{hh[1][:y]} #{hh[1][:v]}"
    if hh[1][:y] == 4950
      l += "\n#{hh[1][:x]} #{hh[1][:y]+50} 0.0\n"
    end
    if i == h.length-1
      101.times.each do |y|
        l += "\n#{hh[1][:x]+50} #{y*50.0} 0.0"
      end
    end
    l
  end

  texts.push('e').join "\n"
end

def h2tl h
  texts = h.sort_by{|k, v| v[:x] * 1e10+v[:y]}.map.with_index do |hh, i|
    l = "#{hh[1][:x]} #{hh[1][:y]} #{hh[1][:v]}"
    if hh[1][:y] == 4950
      l += "\n#{hh[1][:x]} #{hh[1][:y]+50} 0.0\n"
    end
    if i == h.length-1
      171.times.each do |y|
        l += "\n#{hh[1][:x]+50} #{y*50.0} 0.0"
      end
    end
    l
  end

  texts.push('e').join "\n"
end

def diff_v h
  h.select{|k, v| 3500 <= v[:x] and v[:x] <= 4950}.each do |i, v|
    p v[:v].abs
  end
end

def average_v h
  h.select{|k, v| 3500 <= v[:x] and v[:x] <= 4950}.inject(0){|k, v| k+= v[1][:v].abs} / h.select{|k, v| 3500 <= v[:x] and v[:x] <= 4950}.length
  # h.select{|k, v| 3500 <= v[:x] and v[:x] <= 4950}.each{|k, v| p v[:v]}
end

def est(c)
  datadir="./bayesINT/data"
  estfile="Output/mytest_run1.est"
  File.join datadir, c, estfile
end

h81 = get est("domain81"), 0
h98 = get est("domain98"), 3500
# h8198s = getl "./domain8198_square.est", 1750
h8198 = get est("domain8198"), 0

p81 = get est("domain81"), 0, 2
p98 = get est("domain98"), 3500, 2
p8198 = get est("domain8198"), 0, 2

diff81 = diff h81, h8198
diff98 = diff h98, h8198
# diff8198s = diff h8198s, h8198

avg = merge h81, h98, method(:avg)
hybrid1 = merge h81, h98, method(:hybrid1)
hybrid2 = merge h81, h98, method(:hybrid2)
cut = merge h81, h98, method(:cut)

plot h2tl(h8198), "8198.png", 0, 8500, "(a) 全領域(事後分布)"
plot h2t(h81), "81.png", 0, 5000, "(b) No. 81(事後分布)"
plot h2t(h98), "98.png", 3500, 8500, "(c) No. 98(事後分布)"

plot h2t(p81), "p81.png", 0, 5000, "(f) No. 81(事前分布)"
plot h2t(p98), "p98.png", 3500, 8500, "(g) No. 98(事前分布)"
plot h2tl(p8198), "p8198.png", 0, 8500, "(h) 全領域(事前分布)"

# plot h2t(h8198s), "8198s.png", 1750, 6750, "(c) No. 81, 98"
plot h2t(diff81), "diff81.png", 0, 5000, "(d) No. 81と全領域の差分(事後分布)", "-0.1:0.1"
plot h2t(diff98), "diff98.png", 3500, 8500, "(e) No. 98と全領域の差分(事後分布)", "-0.1:0.1"
# plot h2t(diff8198s), "diff8198s.png", 1750, 6750, "(f) No. 81, 98と全領域の差分(事後分布)", "-0.2:0.2"
# plot h2t(avg), "avg.png", 1000, 7500
# plot h2t(hybrid1), "hybrid1.png", 1000, 7500
# plot h2t(hybrid2), "hybrid2.png", 1000, 7500
# plot h2t(cut), "cut.png", 1000, 7500

titles = %W{(a)\ 3500-5000を平均化 (b)\ 4000-4500を平均化 (c)\ 4100-4400を平均化 (d)\ 平均化領域なし}
compare_plot [h2t(avg),h2t(hybrid1),h2t(hybrid2),h2t(cut)], "compare.png", 3000, 5500, titles
titles = %W{(e)\ (a)と全領域の差分 (f)\ (b)と全領域の差分 (g)\ (c)と全領域の差分 (h)\ (d)と全領域の差分}
compare_plot [h2t(diff avg, h8198),h2t(diff hybrid1, h8198),h2t(diff hybrid2, h8198),h2t(diff cut, h8198)], "compare2.png", 3000, 5500, titles, "-0.05:0.05"

# p average_v (diff avg, h8198)
# p average_v (diff hybrid1, h8198)
# p average_v (diff hybrid2, h8198)
# p average_v (diff cut, h8198)
p "avg"
diff_v (diff avg, h8198)
p "hybrid1"
diff_v (diff hybrid1, h8198)
p "hybrid2"
diff_v (diff hybrid2, h8198)
p "cut"
diff_v (diff cut, h8198)
