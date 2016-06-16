module.exports = {
  entry: "./src/app.js",
  externals: /^(?!^(src|\.)\/)/,
  output: {
    path: __dirname + "/dist",
    filename: "bundle.js",
    libraryTarget: "commonjs"
  },
  target: 'node',
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader",
        query: {
          presets: ["es2015"]
        }
      }
    ]
  }
};
