// Bundle vue-tsc declarations without flattening private symbols or weakening types.
import ts from 'typescript'
import { writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

export function cacheDirectory(root, purpose) {
  const repository = resolve(root, '../../..')
  return existsSync(resolve(repository, '.git'))
    ? resolve(repository, 'temp', `uml-studio-${purpose}`)
    : resolve(tmpdir(), 'uml-studio', createHash('sha256').update(root).digest('hex').slice(0, 12), purpose)
}

export async function bundleDeclarations(input, output) {
  const entries = { core: resolve(input, 'src/core.d.ts'), index: resolve(input, 'src/index.d.ts'), native: resolve(input, 'src/native.d.ts') }
  const program = ts.createProgram(Object.values(entries), { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, skipLibCheck: true })
  const checker = program.getTypeChecker()
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  const unalias = symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  const sourceAt = path => {
    const source = program.getSourceFile(path)
    if (!source) throw new Error(`Missing declaration module: ${path}`)
    return source
  }
  const exportsOf = source => checker.getExportsOfModule(checker.getSymbolAtLocation(source))
  const coreSymbols = new Map(exportsOf(sourceAt(entries.core)).map(symbol => [unalias(symbol), symbol.name]))
  const localSource = (source, text) => {
    const path = resolve(dirname(source.fileName), text)
    const found = [path, `${path}.d.ts`, resolve(path, 'index.d.ts')].find(candidate => program.getSourceFile(candidate))
    if (!found) throw new Error(`Unresolved declaration dependency: ${source.fileName}: ${text}`)
    return sourceAt(found)
  }
  const emitted = {}
  for (const [entry, path] of Object.entries(entries)) {
    const namespaces = new Map(), externalImports = [], modules = [], pending = new Set()
    const shared = entry !== 'core'
    const entity = text => text.split('.').reduce((left, name) => left ? ts.factory.createQualifiedName(left, name) : ts.factory.createIdentifier(name), undefined)
    const alias = (name, target, exported = false) => ts.factory.createImportEqualsDeclaration(exported ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)] : undefined, false, name, entity(target))
    function targetOf(symbol) {
      symbol = unalias(symbol)
      if (shared && coreSymbols.has(symbol)) return `__Core.${coreSymbols.get(symbol)}`
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
      if (!declaration || !declaration.name || !ts.isIdentifier(declaration.name)) throw new Error(`Unsupported declaration symbol: ${symbol.name}`)
      const source = declaration.getSourceFile()
      const namespace = visit(source)
      return `${namespace}.${declaration.name.text}`
    }
    function publicStatement(node) {
      const modifiers = [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
      if (ts.isVariableStatement(node)) return ts.factory.updateVariableStatement(node, modifiers, node.declarationList)
      if (ts.isFunctionDeclaration(node)) return ts.factory.updateFunctionDeclaration(node, modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, undefined)
      if (ts.isInterfaceDeclaration(node)) return ts.factory.updateInterfaceDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members)
      if (ts.isTypeAliasDeclaration(node)) return ts.factory.updateTypeAliasDeclaration(node, modifiers, node.name, node.typeParameters, node.type)
      if (ts.isEnumDeclaration(node)) return ts.factory.updateEnumDeclaration(node, modifiers, node.name, node.members)
      if (ts.isClassDeclaration(node)) return ts.factory.updateClassDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members)
      throw new Error(`Unsupported declaration statement in ${node.getSourceFile().fileName}: ${ts.SyntaxKind[node.kind]}`)
    }
    function visit(source) {
      if (namespaces.has(source.fileName)) return namespaces.get(source.fileName)
      const namespace = `__Uml_${namespaces.size}_${basename(source.fileName).replace(/\W/g, '_')}`
      namespaces.set(source.fileName, namespace)
      if (pending.has(source.fileName)) throw new Error(`Cyclic declaration module: ${source.fileName}`)
      pending.add(source.fileName)
      const statements = []
      for (const node of source.statements) {
        if (ts.isImportDeclaration(node)) {
          if (!ts.isStringLiteral(node.moduleSpecifier) || !node.importClause) throw new Error('Unsupported side-effect declaration import')
          const specifier = node.moduleSpecifier.text
          const clause = node.importClause
          if (!specifier.startsWith('.')) {
            // Keep external module imports at file scope, with a unique namespace.
            const name = `__External_${externalImports.length}`
            externalImports.push(`import * as ${name} from ${JSON.stringify(specifier)};`)
            if (clause.name) statements.push(alias(clause.name.text, `${name}.default`))
            if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) statements.push(alias(item.name.text, `${name}.${item.propertyName?.text ?? item.name.text}`))
            else if (clause.namedBindings) statements.push(alias(clause.namedBindings.name.text, name))
          } else {
            const dependency = localSource(source, specifier)
            const symbols = new Map(exportsOf(dependency).map(symbol => [symbol.name, symbol]))
            const namedAlias = (name, imported) => {
              if (!symbols.has(imported)) throw new Error(`Missing declaration export ${specifier}: ${imported}`)
              statements.push(alias(name, targetOf(symbols.get(imported))))
            }
            if (clause.name) namedAlias(clause.name.text, 'default')
            if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) namedAlias(item.name.text, item.propertyName?.text ?? item.name.text)
            else if (clause.namedBindings) throw new Error('Namespace import from a local declaration must be explicit')
          }
        } else if (ts.isExportAssignment(node) || ts.isExportDeclaration(node) || ts.isEmptyStatement(node)) {
          // Public aliases are reconstructed from the compiler's export symbols.
        } else statements.push(publicStatement(node))
      }
      pending.delete(source.fileName)
      modules.push(`declare namespace ${namespace} {\n${statements.map(node => printer.printNode(ts.EmitHint.Unspecified, node, source)).join('\n')}\n}`)
      return namespace
    }
    const publicExports = []
    for (const symbol of exportsOf(sourceAt(path))) publicExports.push(printer.printNode(ts.EmitHint.Unspecified, alias(symbol.name, targetOf(symbol), true), sourceAt(path)))
    const headers = shared ? [`import * as __Core from './core.js';`] : []
    if (entry === 'native') headers.push(`import type { Buffer } from 'node:buffer';`)
    emitted[`${entry}.d.ts`] = ['// Generated from vue-tsc output; internal module scopes preserve exact types.', ...headers, ...externalImports, ...modules, ...publicExports, ''].join('\n\n')
  }
  // Stage all three declarations before replacing any published entry.
  await mkdir(output, { recursive: true })
  const staged = Object.keys(emitted).map(name => resolve(output, `${name}.staged`))
  try {
    for (const [name, content] of Object.entries(emitted)) await writeFile(resolve(output, `${name}.staged`), content)
    for (const name of Object.keys(emitted)) await rename(resolve(output, `${name}.staged`), resolve(output, name))
  } finally {
    await Promise.all(staged.map(path => rm(path, { force: true })))
  }
}
