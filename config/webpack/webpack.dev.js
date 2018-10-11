/**
 * DEVELOPMENT WEBPACK CONFIGURATION
 */

const path = require("path");
const fs = require("fs");
const glob = require("glob");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const AddAssetHtmlPlugin = require("add-asset-html-webpack-plugin");
const CircularDependencyPlugin = require("circular-dependency-plugin");

const logger = require("../../server/logger");
const pkg = require(path.resolve(process.cwd(), "package.json"));
const dllPlugin = pkg.dllPlugin;

const hotEntry = [
  require.resolve("webpack-hot-middleware/client"),
  require.resolve("eventsource-polyfill") // Necessary for hot reloading with IE
];

const workingPath = process.cwd();
const lessToJs = require("less-vars-to-js");
const themeVariables = lessToJs(
  fs.readFileSync(path.resolve(workingPath, "app/theme.less"), "utf8")
);

const plugins = [
  new webpack.HotModuleReplacementPlugin(), // Tell webpack we want hot reloading
  new webpack.NoEmitOnErrorsPlugin(),
  new HtmlWebpackPlugin({
    inject: true, // Inject all files that are generated by webpack, e.g. bundle.js
    template: path.resolve(process.cwd(),"./app/templates/index.dev.html")
  }),
  new CircularDependencyPlugin({
    exclude: /a\.js|node_modules/, // exclude node_modules
    failOnError: false // show a warning when there is a circular dependency
  })
];

if (dllPlugin) {
  glob.sync(`${dllPlugin.path}/*.dll.js`).forEach(dllPath => {
    plugins.push(
      new AddAssetHtmlPlugin({
        filepath: dllPath,
        includeSourcemap: false
      })
    );
  });
}

module.exports = require("./webpack.base")({
  // Add hot reloading in development
  entry: {
    hmr: path.resolve(__dirname,'../../lib/dev-utils/hot-dev-client.js'),
    app: [...hotEntry, path.join(process.cwd(), "app/app.js")]
    // login: [ ...hotEntry, path.join(process.cwd(), 'app/pages/Login/index.js') ]
  },

  // Don't use hashes in dev mode for better performance
  output: {
    filename: "[name].js",
    chunkFilename: "[name].chunk.js"
  },
  mode: "development",

  module: {
    rules: [
      {
        test: /\.css$/,
        exclude: /node_modules/,
        use: [
          require.resolve("style-loader"),
          {
            loader: require.resolve("css-loader"),
            options: {
              minimize: false
            }
          },
          require.resolve("postcss-loader")
        ]
      },
      // scss loader
      {
        test: /\.scss$/,
        exclude: /node_modules/,
        use: [
          require.resolve("style-loader"),
          {
            loader: require.resolve("css-loader"),
            options: {
              // module: true, // css-loader 0.14.5 compatible
              // modules: true
              // localIdentName: '[hash:base64:5]'
              // importLoaders: 1,
              minimize: false
            }
          },
          {
            loader: require.resolve("postcss-loader")
          },
          {
            loader: require.resolve("sass-loader"),
            options: {
              // outputStyle: 'collapsed',
              sourceMap: true,
              includePaths: ["app"]
            }
          }
        ]
      },
      // less loader
      {
        test: /\.less$/,
        use: [
          require.resolve("style-loader"),
          {
            loader: require.resolve("css-loader"),
            options: {
              // module: true, // css-loader 0.14.5 compatible
              // modules: true
              // localIdentName: '[hash:base64:5]'
              // importLoaders: 1,
              minimize: false
            }
          },
          {
            loader: require.resolve("postcss-loader")
          },
          {
            loader: require.resolve("less-loader"),
            options: {
              // outputStyle: 'collapsed',
              modifyVars: themeVariables,
              sourceMap: true
              // includePaths: [path.resolve(workingPath, 'app')]
            }
          }
        ]
      },
      {
        test: /\.(png|svg|jpg|gif|ico)$/,
        use: [
          {
            loader: require.resolve("url-loader"),
            options: {
              limit: "8024",
              name: "[name].[ext]",
              publicPath: "/assets/images/",
              outputPath: "assets/images"
            }
          }
        ]
      }
    ]
  },

  // Add development plugins
  plugins: dependencyHandlers().concat(plugins), // eslint-disable-line no-use-before-define

  // Emit a source map for easier debugging
  // See https://webpack.js.org/configuration/devtool/#devtool
  devtool: "cheap-module-source-map",

  performance: {
    hints: false
  },
  isProd: false
});

/**
 * Select which plugins to use to optimize the bundle's handling of
 * third party dependencies.
 *
 * If there is a dllPlugin key on the project's package.json, the
 * Webpack DLL Plugin will be used.  Otherwise the CommonsChunkPlugin
 * will be used.
 *
 */
function dependencyHandlers() {
  // Don't do anything during the DLL Build step
  if (process.env.BUILDING_DLL) {
    return [];
  }

  // If the package.json does not have a dllPlugin property, use the CommonsChunkPlugin
  if (!dllPlugin) {
    logger.warn(
      "The DLL config is missing, we use DLL to accelarate your web."
    );
    return [];
    // return [
    //   new webpack.optimize.CommonsChunkPlugin({
    //     name: 'vendor',
    //     children: true,
    //     minChunks: 2,
    //     async: true
    //   })
    // ]
  }

  const dllPath = path.resolve(process.cwd(), dllPlugin.path);

  /**
   * If DLLs aren't explicitly defined, we assume all production dependencies listed in package.json
   * Reminder: You need to exclude any server side dependencies by listing them in dllConfig.exclude
   */
  if (!dllPlugin.dlls) {
    const manifestPath = path.resolve(dllPath, "react_vendor_manifest.json");

    if (!fs.existsSync(manifestPath)) {
      logger.error(
        "The DLL manifest is missing. Please run `mete dll`"
      );
      process.exit(0);
    }

    return [
      new webpack.DllReferencePlugin({
        context: process.cwd(),
        manifest: require(manifestPath) // eslint-disable-line global-require
      })
    ];
  }

  // If DLLs are explicitly defined, we automatically create a DLLReferencePlugin for each of them.
  const dllManifests = Object.keys(dllPlugin.dlls).map(name =>
    path.join(dllPath, `/${name}_manifest.json`)
  );

  return dllManifests.map(manifestPath => {
    if (!fs.existsSync(path)) {
      if (!fs.existsSync(manifestPath)) {
        logger.error(
          `The following Webpack DLL manifest is missing: ${path.basename(
            manifestPath
          )}`
        );
        logger.error(`Expected to find it in ${dllPath}`);
        logger.error("Please run: mete dll");

        process.exit(0);
      }
    }
    console.log(`    DLL:
        ${manifestPath} dll added to reference olugin`);
    return new webpack.DllReferencePlugin({
      context: process.cwd(),
      manifest: require(manifestPath) // eslint-disable-line global-require
    });
  });
}
