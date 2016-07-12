module.exports = {
  entry: ['./src/index.js'],
  output: {
    path: `${__dirname}/lib`,
    filename: 'index.js',
    library: 'MonteCalro2048',
    libraryTarget: 'umd',
  },
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          presets: ['es2015'],
        },
      },
    ],
  },
}
