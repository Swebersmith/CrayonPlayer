const ts = require('typescript');
module.exports = {
  process(sourceText, sourcePath) {
    return ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
  },
};
