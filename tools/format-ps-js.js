#!/usr/bin/env node
/*
 * Formatting-only migration for IGAsim res/PS_*.js.
 * Uses TypeScript's parser/formatter as a DEVELOPMENT tool. Does not add runtime dependencies.
 * Works with a locally/global-installed TypeScript package; never downloads dependencies.
 * Only updates files when syntax and all nontrivia JavaScript tokens are unchanged.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

function loadTypeScript()
{
    try { return require('typescript'); }
    catch (error)
    {
        try
        {
            const globalRoot = cp.execFileSync('npm', ['root','-g'], {encoding:'utf8'}).trim();
            return require(path.join(globalRoot, 'typescript'));
        }
        catch (secondError)
        {
            throw new Error('TypeScript formatter not found. Install typescript locally or globally (development only).');
        }
    }
}
const ts = loadTypeScript();

function replaceSpans(text, spans)
{
    const descending = spans.slice().sort((a,b) => b.start-a.start);
    let updated = text;
    for (const edit of descending)
    {
        updated = updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
    }
    return updated;
}

function formatWithTypeScript(filename, text)
{
    const host = {
        getCompilationSettings: () => ({allowJs:true,target:ts.ScriptTarget.ESNext}),
        getScriptFileNames: () => [filename],
        getScriptVersion: () => '1',
        getScriptSnapshot: name => name === filename ? ts.ScriptSnapshot.fromString(text) : undefined,
        getCurrentDirectory: () => process.cwd(),
        getDefaultLibFileName: () => '',
        fileExists: () => false,
        readFile: () => undefined,
        readDirectory: () => []
    };
    const service = ts.createLanguageService(host,ts.createDocumentRegistry());
    const settings = {
        indentSize:4, tabSize:4, convertTabsToSpaces:true, newLineCharacter:'\n',
        indentStyle:ts.IndentStyle.Smart,
        placeOpenBraceOnNewLineForFunctions:true,
        placeOpenBraceOnNewLineForControlBlocks:true,
        insertSpaceBeforeFunctionParenthesis:false,
        insertSpaceAfterCommaDelimiter:true,
        insertSpaceAfterSemicolonInForStatements:true,
        insertSpaceBeforeAndAfterBinaryOperators:true,
        insertSpaceAfterKeywordsInControlFlowStatements:true,
        insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces:true
    };
    try
    {
        return replaceSpans(text,service.getFormattingEditsForDocument(filename,settings).map(e =>
            ({start:e.span.start,end:e.span.start+e.span.length,text:e.newText})));
    }
    finally {service.dispose();}
}

function expandLargeInlineBlocks(text, filename)
{
    const sf=ts.createSourceFile(filename,text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
    const positions=new Set();
    function visit(node)
    {
        if (ts.isBlock(node) && node.statements.length)
        {
            const start=node.getStart(sf),end=node.getEnd();
            const raw=text.slice(start,end);
            const lineStart=text.lastIndexOf('\n',start-1)+1;
            const prefix=text.slice(lineStart,start);
            if (!raw.includes('\n') && (prefix.length+raw.length>100 || node.statements.length>2))
            {
                positions.add(start+1);
                for (const statement of node.statements) positions.add(statement.getEnd());
                positions.add(end-1);
            }
        }
        ts.forEachChild(node,visit);
    }
    visit(sf);
    let out=text;
    for (const index of [...positions].sort((a,b)=>b-a))
    {
        if (out[index] !== '\n' && out[index-1] !== '\n') out=out.slice(0,index)+'\n'+out.slice(index);
    }
    return out;
}

function compactScalarArrays(text, filename)
{
    const sf = ts.createSourceFile(filename,text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
    const spans=[];
    function visit(node)
    {
        if (ts.isArrayLiteralExpression(node) && node.elements.length>0 &&
            node.elements.every(e => ts.isStringLiteral(e) || ts.isNumericLiteral(e) ||
                e.kind===ts.SyntaxKind.TrueKeyword || e.kind===ts.SyntaxKind.FalseKeyword ||
                e.kind===ts.SyntaxKind.NullKeyword ||
                (ts.isPrefixUnaryExpression(e) && e.operator===ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand))))
        {
            const start=node.getStart(sf),end=node.getEnd(),original=text.slice(start,end);
            const replacement='['+node.elements.map(e => e.getText(sf)).join(',')+']';
            // Keep long arrays wrapped. Do not modify arrays containing comments.
            if (replacement.length<=108 && !/\/\/|\/\*/.test(original))
            {
                spans.push({start,end,text:replacement});
            }
        }
        ts.forEachChild(node,visit);
    }
    visit(sf);
    return replaceSpans(text,spans);
}

function compactShortFunctions(text, filename)
{
    const sf=ts.createSourceFile(filename,text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
    const spans=[];
    function visit(node)
    {
        if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
             ts.isArrowFunction(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node)) &&
             node.body && ts.isBlock(node.body) && node.body.statements.length===1)
        {
            const body=node.body, stmt=body.statements[0];
            if (ts.isReturnStatement(stmt) || ts.isExpressionStatement(stmt))
            {
                const start=body.getStart(sf),end=body.getEnd();
                const original=text.slice(start,end),statement=stmt.getText(sf).trim();
                const prefix=text.slice(text.lastIndexOf('\n',start-1)+1,start);
                const replacement='{ '+statement+' }';
                if (prefix.trim() && !statement.includes('\n') && !/\/\/|\/\*/.test(original) &&
                    prefix.length+replacement.length<=100 && !prefix.includes('//'))
                {
                    spans.push({start,end,text:replacement});
                }
            }
        }
        ts.forEachChild(node,visit);
    }
    visit(sf);
    return replaceSpans(text,spans);
}

function normalizeAllmanLayout(text)
{
    // Keep catch/else/finally on their own lines, and remove trailing whitespace.
    let result=text.replace(/^([ \t]*)}([ \t]*)(catch|finally|else|return|const|let|var|if|while|for|continue|break|throw)\b/gm, '$1}\n$1$3');
    const lines=result.split('\n');
    for (let i=1;i<lines.length;i++)
    {
        if (!/^\s*\{$/.test(lines[i])) continue;
        const prev=lines[i-1];
        if (/\)\s*$|=>\s*$|\b(?:try|finally|else|do)\s*$/.test(prev))
        {
            lines[i]=(/^\s*/.exec(prev)||[''])[0]+'{';
        }
    }
    return lines.join('\n').replace(/[ \t]+$/gm,'').replace(/\n[ \t]*\n([ \t]*[}\]])/g,'\n$1');
}

function syntacticFingerprint(text, filename)
{
    const source=ts.createSourceFile(filename,text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
    const out=[];
    function walk(node)
    {
        // JSDoc comments are not part of the JavaScript program's execution.
        if (node.kind >= ts.SyntaxKind.JSDocTypeExpression && node.kind <= ts.SyntaxKind.JSDocComment) return;
        out.push(node.kind);
        let n=0;
        ts.forEachChild(node, child => {n++;walk(child);});
        if (n===0 && (ts.isIdentifier(node) || ts.isLiteralExpression(node) ||
            node.kind===ts.SyntaxKind.PrivateIdentifier ||
            node.kind===ts.SyntaxKind.RegularExpressionLiteral ||
            node.kind===ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
            node.kind===ts.SyntaxKind.TemplateHead ||
            node.kind===ts.SyntaxKind.TemplateMiddle ||
            node.kind===ts.SyntaxKind.TemplateTail))
        {
            out.push(node.getText(source));
        }
    }
    walk(source);
    return out;
}

function assertSameTokens(before,after,filename)
{
    // Compare full parsed JS structure, not a context-free regexp-unaware scanner.
    const a=syntacticFingerprint(before,filename),b=syntacticFingerprint(after,filename);
    if (a.length!==b.length) throw new Error(filename+': AST fingerprint length changed '+a.length+' to '+b.length);
    for (let i=0;i<a.length;i++)
    {
        if (a[i]!==b[i]) throw new Error(filename+': AST change at index '+i+': '+JSON.stringify(a[i])+' → '+JSON.stringify(b[i]));
    }
}

function assertValidJavaScript(text,filename)
{
    const sf=ts.createSourceFile(filename,text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
    if (sf.parseDiagnostics.length)
    {
        throw new Error(filename+': '+ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText,'\n'));
    }
}

function main()
{
    const args=process.argv.slice(2);
    const check=args.includes('--check');
    const rootArg=args.find(x => !x.startsWith('--'));
    const root=path.resolve(rootArg || path.join(__dirname,'../..'));
    const res=path.join(root,'res');
    if (!fs.existsSync(res)) throw new Error('Missing res/ directory: '+res);
    const files=fs.readdirSync(res).filter(x => /^PS_.*\.js$/i.test(x)).sort();
    if (!files.length) throw new Error('No PS_*.js files found in '+res);
    let changed=0;
    const replacements=[];
    for (const name of files)
    {
        const filename=path.join(res,name),source=fs.readFileSync(filename,'utf8');
        assertValidJavaScript(source,name);
        let result=expandLargeInlineBlocks(source,filename);
        result=formatWithTypeScript(filename,result);
        result=compactScalarArrays(result,filename);
        result=compactShortFunctions(result,filename);
        result=normalizeAllmanLayout(result);
        assertValidJavaScript(result,name);
        assertSameTokens(source,result,name);
        if (source!==result)
        {
            changed++;
            replacements.push({filename,result});
        }
        process.stdout.write((source===result?'OK      ':'REFORMAT')+' '+name+'\n');
    }
    // Verify every file before modifying any of them.
    if (!check)
    {
        for (const replacement of replacements)
        {
            fs.writeFileSync(replacement.filename,replacement.result,'utf8');
        }
    }
    console.log(files.length+' files checked; '+changed+' '+(check?'would change.':'modified.'));
    if (check && changed) process.exitCode=1;
}

try {main();}
catch (error) {console.error('Refusing to write: '+error.message);process.exitCode=2;}
