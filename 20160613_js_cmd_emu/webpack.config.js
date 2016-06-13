module.exports={
  entry: ["./src/app.js"],
  output: {
    path: __dirname+"/dist",
    filename: "bundle.js"
  },
  target: "node",
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          presets: ['react', 'es2015']
        }
      }
    ]
  }
}
