/* PowerShellJS v0.1 — browser-first, dependency-free, deliberately limited PowerShell simulator.
 * No eval(), OS shell, host filesystem, remote requests or PowerShell subprocess.
 * CommonJS export is provided only for offline regression tests; no Node dependency.
 */
(function (root, factory) {
  'use strict';
  var exports = factory();
  if (typeof module === 'object' && module.exports) module.exports = exports;
  if (root) root.PowerShellJS = exports;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.1.0';
  const MAX_SOURCE_LENGTH = 100000;
  const MAX_STATEMENTS = 500;
  const MAX_PIPELINE_ITEMS = 10000;
  const MAX_OUTPUT_CHARS = 500000;
  const lower = value => String(value).toLowerCase();

  class PSError extends Error {
    constructor(message, code = 'PSSimulationError') {
      super(message);
      this.name = 'PSError';
      this.code = code;
    }
  }

  function isEscaped(src, pos) {
    let n = 0;
    while (pos - n - 1 >= 0 && src[pos - n - 1] === '`') n++;
    return n % 2 === 1;
  }

  function stripComments(src) {
    let out = '', quote = null;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && !isEscaped(src, i)) {
          if (quote === "'" && src[i + 1] === "'") { out += "''"; i++; continue; }
          quote = null;
        }
        out += c;
      } else if (c === "'" || c === '"') { quote = c; out += c; }
      else if (c === '#' && !isEscaped(src, i)) {
        while (i < src.length && src[i] !== '\n') i++;
        if (i < src.length) out += '\n';
      } else out += c;
    }
    return out;
  }

  /** Split at specified delimiters outside quotes, braces, and parentheses. */
  function splitTopLevel(source, delimiters) {
    let result = [], start = 0, quote = null, curly = 0, round = 0, line = 1, itemLine = 1;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote && !isEscaped(source, i)) {
          if (c === "'" && source[i + 1] === "'") { i++; continue; }
          quote = null;
        }
      } else if (c === "'" || c === '"') quote = c;
      else if (c === '{') curly++;
      else if (c === '}') { curly--; if (curly < 0) throw new PSError('Unexpected closing brace.','ParserError'); }
      else if (c === '(') round++;
      else if (c === ')') { round--; if (round < 0) throw new PSError('Unexpected closing parenthesis.','ParserError'); }
      else if (curly === 0 && round === 0 && delimiters.includes(c)) {
        const text = source.slice(start, i).trim();
        if (text) result.push({ text, line: itemLine });
        start = i + 1;
        itemLine = line + (c === '\n' ? 1 : 0);
      }
      if (c === '\n') line++;
    }
    if (quote) throw new PSError('Unterminated quoted string.','ParserError');
    if (curly !== 0 || round !== 0) throw new PSError('Unbalanced braces or parentheses.','ParserError');
    const tail = source.slice(start).trim();
    if (tail) result.push({ text: tail, line: itemLine });
    return result;
  }

  function tokenizeArgs(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      const start = i;
      if (src[i] === '"' || src[i] === "'") {
        const quote = src[i++];
        let val = '';
        let closed = false;
        while (i < src.length) {
          const c = src[i++];
          if (c === quote) {
            if (quote === "'" && src[i] === "'") { val += "'"; i++; continue; }
            closed = true; break;
          }
          if (c === '`' && quote === '"' && i < src.length) {
            const next = src[i++];
            val += ({n:'\n',r:'\r',t:'\t','`':'`','"':'"','$':'\u0000$'})[next] ?? next;
          } else val += c;
        }
        if (!closed) throw new PSError('Unterminated quoted argument.','ParserError');
        tokens.push({type:'string', value:val, quote, raw:src.slice(start,i)});
      } else {
        while (i < src.length && !/\s/.test(src[i])) {
          // Script blocks can contain whitespace and are handled as a single parameter token.
          if (src[i] === '{') {
            let depth = 0, q = null;
            do {
              const c = src[i];
              if (q) { if (c === q && !isEscaped(src,i)) q = null; }
              else if (c === "'" || c === '"') q = c;
              else if (c === '{') depth++;
              else if (c === '}') depth--;
              i++;
            } while (i < src.length && depth > 0);
            if (depth) throw new PSError('Unterminated script block.','ParserError');
          } else i++;
        }
        tokens.push({type:'word', value:src.slice(start,i), raw:src.slice(start,i)});
      }
    }
    return tokens;
  }

  function resolveProp(value, path) {
    for (const name of path) {
      if (value === null || value === undefined) return undefined;
      const keys = Object.keys(Object(value));
      const match = keys.find(k => lower(k) === lower(name));
      value = match === undefined ? undefined : value[match];
    }
    return value;
  }

  function stringValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'object') return Array.isArray(value) ? value.map(stringValue).join(' ') : '[PSCustomObject]';
    return String(value);
  }

  function interpolate(text, session) {
    return text.replace(/\$([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?/g, (_all, name, prop) => {
      const value = session.getVariable(name);
      return stringValue(prop ? resolveProp(value, [prop]) : value);
    }).replace(/\u0000\$/g, '$');
  }

  function evaluateAtom(token, session) {
    if (token.type === 'string') return token.quote === '"' ? interpolate(token.value, session) : token.value;
    const word = token.value;
    if (/^\$([\w]+)(\.[\w]+)*$/i.test(word)) {
      const parts = word.slice(1).split('.');
      return resolveProp(session.getVariable(parts.shift()), parts);
    }
    if (/^-?\d+(?:\.\d+)?$/.test(word)) return Number(word);
    if (/^\$(true|false|null)$/i.test(word)) return ({'$true':true,'$false':false,'$null':null})[lower(word)];
    return word;
  }

  /** Small expression parser: values, arithmetic and comparisons; no JS evaluation. */
  function evalExpression(source, session) {
    const src = source.trim();
    const tokens = [];
    let i = 0;
    const lex = /\s+|"(?:`.|[^"`])*"|'(?:''|[^'])*'|\$[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*|\d+(?:\.\d+)?|-eq\b|-ne\b|-gt\b|-ge\b|-lt\b|-le\b|-and\b|-or\b|[()+*\/,\-]|[^\s()+*\/,\-]+/iy;
    while (i < src.length) {
      lex.lastIndex = i;
      const match = lex.exec(src);
      if (!match) throw new PSError('Invalid expression near: ' + src.slice(i), 'ParserError');
      i = lex.lastIndex;
      if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
    }
    let cursor = 0;
    const precedence = { '-or':1, '-and':2, '-eq':3, '-ne':3, '-gt':3, '-ge':3, '-lt':3, '-le':3, '+':4, '-':4, '*':5, '/':5 };
    const peek = () => tokens[cursor];
    const next = () => tokens[cursor++];
    function primary() {
      const word = next();
      if (word === undefined) throw new PSError('Incomplete expression.','ParserError');
      if (word === '-') return -Number(parseExpr(6));
      if (word === '(') {
        const value = parseExpr(0);
        if (next() !== ')') throw new PSError('Expected closing parenthesis.','ParserError');
        return value;
      }
      if (word.startsWith('"') || word.startsWith("'")) {
        const token = tokenizeArgs(word)[0];
        return evaluateAtom(token, session);
      }
      if (/^\$[\w]+(?:\.[\w]+)*$/i.test(word)) return evaluateAtom({type:'word',value:word}, session);
      if (/^\d+(?:\.\d+)?$/.test(word)) return Number(word);
      throw new PSError('Unsupported expression token: ' + word, 'NotSupported');
    }
    function parseExpr(min) {
      let lhs = primary();
      while (peek() !== undefined && precedence[lower(peek())] >= min) {
        const op = lower(next()), rhs = parseExpr(precedence[op] + 1);
        switch (op) {
          case '+': lhs = typeof lhs === 'string' || typeof rhs === 'string' ? stringValue(lhs) + stringValue(rhs) : Number(lhs) + Number(rhs); break;
          case '-': lhs = Number(lhs) - Number(rhs); break;
          case '*': lhs = Number(lhs) * Number(rhs); break;
          case '/': if (Number(rhs) === 0) throw new PSError('Division by zero.','DivideByZero'); lhs = Number(lhs) / Number(rhs); break;
          case '-eq': lhs = compare(lhs,rhs) === 0; break;
          case '-ne': lhs = compare(lhs,rhs) !== 0; break;
          case '-gt': lhs = compare(lhs,rhs) > 0; break;
          case '-ge': lhs = compare(lhs,rhs) >= 0; break;
          case '-lt': lhs = compare(lhs,rhs) < 0; break;
          case '-le': lhs = compare(lhs,rhs) <= 0; break;
          case '-and': lhs = !!lhs && !!rhs; break;
          case '-or': lhs = !!lhs || !!rhs; break;
        }
      }
      return lhs;
    }
    if (!tokens.length) return null;
    const value = parseExpr(0);
    if (cursor !== tokens.length) throw new PSError('Unexpected token in expression: ' + peek(),'ParserError');
    return value;
  }

  function compare(a,b) {
    if (typeof a === 'number' && typeof b === 'number') return a-b;
    return stringValue(a).localeCompare(stringValue(b),undefined,{sensitivity:'accent'});
  }

  function parse(source) {
    if (typeof source !== 'string') throw new TypeError('PowerShell source must be a string.');
    if (source.length > MAX_SOURCE_LENGTH) throw new PSError('Source exceeds maximum length.','ResourceLimit');
    // Remove line continuations and comments, preserving statement lines.
    const clean = stripComments(source.replace(/`\r?\n/g, ' ').replace(/\|[ \t]*\r?\n/g, '| ')).replace(/\r\n/g, '\n');
    const statements = splitTopLevel(clean, ['\n',';']);
    if (statements.length > MAX_STATEMENTS) throw new PSError('Too many statements.','ResourceLimit');
    return statements.map(({text,line}) => {
      const assignment = /^\$([A-Za-z_][\w]*)\s*=\s*([\s\S]+)$/.exec(text);
      if (assignment) return {kind:'assignment', line, name:assignment[1], expression:assignment[2]};
      const stages = splitTopLevel(text, ['|']).map(entry => ({source:entry.text}));
      if (!stages.length) throw new PSError('Empty statement.','ParserError');
      return {kind:'pipeline', line, stages};
    });
  }

  class VirtualFS {
    constructor() { this.reset(); }
    reset() {
      this.items = new Map();
      this.cwd = 'C:\\Users\\Demo';
      ['C:\\','C:\\Users','C:\\Users\\Demo','C:\\Temp','C:\\Windows','C:\\Windows\\System32'].forEach(path => this.putDir(path));
      this.write('C:\\Users\\Demo\\README.txt','PowerShellJS v0.1\nThis is a simulated filesystem.\n');
      this.write('C:\\Temp\\example.txt','Hello from your browser-only PowerShell!\n');
      this.write('C:\\Windows\\version.txt','Simulated Windows Environment v0.1\n');
    }
    normalize(path) {
      if (path === undefined || path === null || String(path).trim() === '') return this.cwd;
      const raw = String(path).replace(/\//g,'\\');
      const full = /^[A-Za-z]:\\/.test(raw) ? raw : raw.startsWith('\\') ? 'C:' + raw : this.cwd + '\\' + raw;
      const drive = full.slice(0,2).toUpperCase();
      if (drive !== 'C:') throw new PSError('Drive does not exist: ' + drive, 'DriveNotFound');
      const parts = [];
      for (const part of full.slice(2).split('\\')) {
        if (!part || part === '.') continue;
        if (part === '..') { parts.pop(); continue; }
        parts.push(part);
      }
      return drive + '\\' + parts.join('\\');
    }
    key(path) { return lower(this.normalize(path)); }
    parent(path) {
      const normalized = this.normalize(path);
      if (normalized === 'C:\\') return null;
      const pos = normalized.lastIndexOf('\\');
      return pos === 2 ? 'C:\\' : normalized.slice(0,pos);
    }
    get(path) { return this.items.get(this.key(path)); }
    require(path) {
      const item = this.get(path);
      if (!item) throw new PSError('Cannot find path: ' + this.normalize(path),'PathNotFound');
      return item;
    }
    putDir(path) {
      const full = this.normalize(path);
      const parent = this.parent(full);
      if (parent && (!this.get(parent) || !this.get(parent).isDirectory)) throw new PSError('Parent directory does not exist: '+parent,'PathNotFound');
      if (this.get(full)) throw new PSError('Item already exists: '+full,'ItemExists');
      this.items.set(lower(full),{path:full,isDirectory:true,content:null});
    }
    write(path,content,append=false) {
      const full = this.normalize(path);
      const parent = this.parent(full);
      if (!parent || !this.get(parent) || !this.get(parent).isDirectory) throw new PSError('Parent directory does not exist: '+parent,'PathNotFound');
      const existing = this.get(full);
      if (existing && existing.isDirectory) throw new PSError('Cannot write to directory: '+full,'InvalidOperation');
      this.items.set(lower(full),{path:existing ? existing.path : full,isDirectory:false,content:(append && existing ? existing.content : '') + String(content)});
    }
    remove(path) {
      const full = this.normalize(path);
      if (full === 'C:\\') throw new PSError('Cannot remove drive root.','InvalidOperation');
      const item = this.require(full);
      if (item.isDirectory && this.children(full).length) throw new PSError('Directory is not empty: '+full,'DirectoryNotEmpty');
      this.items.delete(lower(full));
    }
    children(path) {
      const dir = this.require(path);
      if (!dir.isDirectory) throw new PSError('Not a directory: ' + dir.path,'NotDirectory');
      return [...this.items.values()].filter(item => lower(this.parent(item.path) || '') === lower(dir.path))
        .sort((a,b) => Number(b.isDirectory) - Number(a.isDirectory) || a.path.localeCompare(b.path));
    }
    toObject(item) {
      return {Mode:item.isDirectory?'d----':'-a---', Name:item.path.split('\\').pop() || 'C:\\', Length:item.isDirectory?null:item.content.length, FullName:item.path, PSIsContainer:item.isDirectory};
    }
    setLocation(path) {
      const item = this.require(path);
      if (!item.isDirectory) throw new PSError('Location is not a directory: '+item.path,'NotDirectory');
      this.cwd = item.path;
    }
    snapshot() { return {cwd:this.cwd,items:[...this.items.values()].map(x => ({...x}))}; }
  }

  class Session {
    constructor() { this.fs = new VirtualFS(); this.variables = new Map(); }
    getVariable(name) {
      const key = lower(name);
      if (key === 'pwd') return this.fs.cwd;
      if (key === 'home') return 'C:\\Users\\Demo';
      if (key === 'true') return true;
      if (key === 'false') return false;
      if (key === 'null') return null;
      if (key === 'error') return undefined;
      return this.variables.get(key);
    }
    setVariable(name,value) {
      const key = lower(name);
      if (['pwd','home','true','false','null'].includes(key)) throw new PSError('Variable is read-only: $'+name,'VariableIsReadOnly');
      this.variables.set(key,value);
    }
    reset() { this.fs.reset(); this.variables.clear(); }
    snapshot() { return {cwd:this.fs.cwd,variables:Object.fromEntries(this.variables),filesystem:this.fs.snapshot()}; }
  }

  function parseInvocation(source, session) {
    const tokens = tokenizeArgs(source);
    if (!tokens.length) throw new PSError('Missing command.','ParserError');
    const command = lower(tokens.shift().value);
    const positionals = [];
    const parameters = new Map();
    const knownSwitches = new Set(['force','recurse','passthru','noenumerate','descending']);
    for (let i=0; i<tokens.length; i++) {
      const t=tokens[i];
      if (t.type === 'word' && /^-[A-Za-z][\w-]*(?::.*)?$/.test(t.value)) {
        const m = /^-([A-Za-z][\w-]*)(?::(.*))?$/.exec(t.value);
        const key = lower(m[1]);
        let val = m[2] !== undefined ? m[2] : true;
        if (m[2] === undefined && !knownSwitches.has(key) && tokens[i+1] && !(/^-[A-Za-z]/.test(tokens[i+1].value) && tokens[i+1].type === 'word')) {
          val = evaluateAtom(tokens[++i],session);
        }
        parameters.set(key,val);
      } else positionals.push(evaluateAtom(t,session));
    }
    return {command,positionals,parameters,has:key=>parameters.has(lower(key)),get:(key,fallback) => parameters.has(lower(key))?parameters.get(lower(key)):fallback};
  }

  function getArg(args,key,index=0,fallback) { return args.has(key) ? args.get(key) : (args.positionals[index] !== undefined ? args.positionals[index] : fallback); }
  function strList(value) { return Array.isArray(value) ? value : String(value ?? '').split(',').map(s=>s.trim()).filter(Boolean); }
  function result(values=[],messages=[],effects=[]) { return {values,messages,effects}; }
  function itemText(value) { return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value,null,2) : stringValue(value); }

  class PowerShellSimulator {
    constructor(options={}) {
      this.version=VERSION;
      this.session=new Session();
      this.commands=new Map();
      this.aliases=new Map();
      this._registerBuiltins();
      if (Array.isArray(options.commands)) options.commands.forEach(command=>this.registerCommand(command));
    }
    registerCommand(command) {
      if (!command || typeof command.name !== 'string' || typeof command.run !== 'function') throw new TypeError('Command requires {name,run}.');
      const name = lower(command.name);
      this.commands.set(name,{...command,name:command.name});
      for (const alias of (command.aliases || [])) this.aliases.set(lower(alias),name);
    }
    listCommands() { return [...this.commands.values()].map(({name,aliases=[],description=''}) => ({Name:name,Aliases:aliases.join(', '),Description:description})).sort((a,b)=>a.Name.localeCompare(b.Name)); }
    reset() { this.session.reset(); }
    getPrompt() { return 'PS ' + this.session.fs.cwd + '> '; }
    parse(source) { return parse(source); }
    getSession() { return this.session.snapshot(); }
    async execute(source) {
      const output = [], errors = [], effects = [];
      const pushOutput = line => {
        const str=String(line);
        if (output.join('\n').length + str.length > MAX_OUTPUT_CHARS) throw new PSError('Output limit exceeded.','ResourceLimit');
        output.push(str);
      };
      let ast;
      try { ast = this.parse(source); }
      catch(err) { return {success:false,output,errors:[`${err.code || 'ParserError'}: ${err.message}`],effects,cwd:this.session.fs.cwd,objects:[]}; }
      let lastObjects=[];
      for (const statement of ast) {
        try {
          if (statement.kind === 'assignment') {
            const value = evalExpression(statement.expression,this.session);
            this.session.setVariable(statement.name,value);
            lastObjects=[];
            continue;
          }
          let stream=[];
          for (const stage of statement.stages) {
            const trimmed=stage.source.trim();
            if (/^\$[A-Za-z_][\w]*(?:\.[\w]+)*$/.test(trimmed) || /^(?:\d+(?:\.\d+)?|\(.+\))$/.test(trimmed)) {
              stream=[evalExpression(trimmed,this.session)];
              continue;
            }
            const args=parseInvocation(trimmed,this.session);
            const commandName=this.aliases.get(args.command) || args.command;
            const command=this.commands.get(commandName);
            if (!command) throw new PSError(`The term '${args.command}' is not recognized as a simulated cmdlet. Try Get-Command.`, 'CommandNotFound');
            const step=await command.run({args,input:stream,session:this.session,fs:this.session.fs,engine:this});
            if (!step || !Array.isArray(step.values)) throw new PSError(`Invalid result from '${command.name}' cmdlet.`,'EngineContractError');
            stream=step.values;
            if (stream.length > MAX_PIPELINE_ITEMS) throw new PSError('Pipeline item limit exceeded.','ResourceLimit');
            for (const message of step.messages || []) pushOutput(itemText(message));
            effects.push(...(step.effects || []));
          }
          lastObjects=stream;
          for (const line of formatObjects(stream)) pushOutput(line);
        } catch(err) {
          errors.push(`Line ${statement.line} [${err.code || 'RuntimeError'}]: ${err.message}`);
          lastObjects=[];
          break; // stop this script on first error in v0.1
        }
      }
      return {success:errors.length===0,output,errors,effects,cwd:this.session.fs.cwd,objects:lastObjects};
    }
    _registerBuiltins() {
      const reg=(name,aliases,description,run)=>this.registerCommand({name,aliases,description,run});
      reg('Write-Output',['echo','write'], 'Send objects to the output pipeline.', async({args,input})=> {
        return result(args.positionals.length ? args.positionals.flat() : input);
      });
      reg('Write-Host',[], 'Write formatted text to the host, not the pipeline.', async({args,input})=>result([], [args.positionals.length ? args.positionals.map(stringValue).join(' ') : input.map(stringValue).join(' ')]));
      reg('Get-Location',['pwd','gl'], 'Display the virtual working directory.', async({fs})=>result([{Path:fs.cwd}]));
      reg('Set-Location',['cd','sl','chdir'], 'Change the virtual working directory.', async({args,fs})=> {fs.setLocation(getArg(args,'path',0,'C:\\Users\\Demo'));return result();});
      reg('Get-ChildItem',['ls','dir','gci'], 'List items in the virtual filesystem.', async({args,fs})=> {
        const path=getArg(args,'path',0,fs.cwd);
        const item=fs.require(path);
        const items=item.isDirectory?fs.children(item.path):[item];
        return result(items.map(x=>args.has('name')?x.path.split('\\').pop():fs.toObject(x)));
      });
      reg('Get-Item',['gi'], 'Read a virtual filesystem item.', async({args,fs})=>result([fs.toObject(fs.require(getArg(args,'path',0,fs.cwd)))]));
      reg('Test-Path',[], 'Check whether a virtual path exists.', async({args,fs})=>result([!!fs.get(getArg(args,'path',0,''))]));
      reg('Get-Content',['cat','type','gc'], 'Read lines from a virtual file.', async({args,fs})=> {
        const file=fs.require(getArg(args,'path',0,''));
        if (file.isDirectory) throw new PSError('Cannot read directory as a file.','InvalidOperation');
        return result(file.content.replace(/\r\n/g,'\n').split('\n').filter((v,i,all)=>i!==all.length-1 || v!==''));
      });
      reg('Set-Content',['sc'], 'Write text to a virtual file.', async({args,input,fs})=> {
        const path=getArg(args,'path',0,undefined);
        if (path === undefined) throw new PSError('Set-Content requires -Path.','MissingParameter');
        const content=args.has('value')?args.get('value'):args.positionals.length>1?args.positionals.slice(1).map(stringValue).join(' '):input.map(stringValue).join('\n');
        fs.write(path,stringValue(content));
        return result();
      });
      reg('Add-Content',['ac'], 'Append text to a virtual file.', async({args,input,fs})=> {
        const path=getArg(args,'path',0,undefined);
        if (path === undefined) throw new PSError('Add-Content requires -Path.','MissingParameter');
        const content=args.has('value')?args.get('value'):args.positionals.length>1?args.positionals.slice(1).map(stringValue).join(' '):input.map(stringValue).join('\n');
        fs.write(path,stringValue(content),true);
        return result();
      });
      reg('New-Item',['ni'], 'Create a file or directory in virtual storage.', async({args,fs})=> {
        const path=getArg(args,'path',0,undefined);
        if(path===undefined) throw new PSError('New-Item requires -Path.','MissingParameter');
        const kind=lower(args.get('itemtype','File'));
        if(kind==='directory'||kind==='dir') fs.putDir(path);
        else if(kind==='file') {if(fs.get(path)) throw new PSError('Item already exists: '+path,'ItemExists');fs.write(path,'');}
        else throw new PSError('Supported ItemType: File, Directory.','NotSupported');
        return result([fs.toObject(fs.require(path))]);
      });
      reg('Remove-Item',['rm','del','ri'], 'Delete an empty virtual directory or a file.', async({args,fs})=>{fs.remove(getArg(args,'path',0,''));return result();});
      reg('Where-Object',['where','?'], 'Filter incoming objects using a simple comparison script block.', async({args,input,session})=> {
        const script=String(args.positionals[0] ?? args.get('filterscript','')).trim();
        const match=/^\{([\s\S]*)\}$/.exec(script);
        if (!match) throw new PSError('Where-Object v0.1 expects { $_.Property -eq value } (or -ne/-gt/-ge/-lt/-le).','NotSupported');
        const body=match[1].trim();
        if (!/^\$_\.[\w]+\s+-(eq|ne|gt|ge|lt|le)\s+/i.test(body)) throw new PSError('Unsupported Where-Object script block.','NotSupported');
        const key='_', wasSet=session.variables.has(key), old=session.variables.get(key);
        try {
          return result(input.filter(item => {session.variables.set(key,item);return !!evalExpression(body,session);}));
        } finally {
          if (wasSet) session.variables.set(key,old); else session.variables.delete(key);
        }
      });
      reg('Select-Object',['select'], 'Choose properties from incoming pipeline objects.', async({args,input})=> {
        const selected=strList(args.get('property',args.positionals.join(' ')));
        if(!selected.length) throw new PSError('Select-Object requires property names.','MissingParameter');
        return result(input.map(item=>{
          const out={};
          for(const field of selected) out[field]=resolveProp(item,[field]);
          return out;
        }));
      });
      reg('Sort-Object',['sort'], 'Sort incoming objects by one property.', async({args,input})=> {
        const key=getArg(args,'property',0,'Name');
        const multiplier=args.has('descending')?-1:1;
        return result([...input].sort((a,b)=>multiplier*compare(resolveProp(a,[key]),resolveProp(b,[key]))));
      });
      reg('Get-Variable',['gv'], 'List session variables.', async({args,session})=> {
        const entries=[...session.variables.entries()].map(([Name,Value])=>({Name,Value}));
        const name=getArg(args,'name',0,undefined);
        return result(name===undefined?entries:entries.filter(v=>lower(v.Name)===lower(name)));
      });
      reg('Get-Command',['gcm'], 'List simulated commands (not system commands).', async({args,engine})=> {
        const pattern=getArg(args,'name',0,'*');
        const regexp=new RegExp('^'+String(pattern).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\*/g,'.*')+'$','i');
        return result(engine.listCommands().filter(command=>regexp.test(command.Name)));
      });
      reg('Get-Help',['help','man'], 'Display help for a simulated command.', async({args,engine})=> {
        const name=getArg(args,'name',0,undefined);
        if(!name) return result(['PowerShellJS v0.1: Get-Command lists implemented cmdlets. Use Get-Help <cmdlet>.']);
        const lookup=engine.aliases.get(lower(name))||lower(name);
        const cmd=engine.commands.get(lookup);
        if(!cmd) throw new PSError('No simulated help exists for: '+name,'CommandNotFound');
        return result([`${cmd.name} — ${cmd.description}${cmd.aliases.length?'\nAliases: '+cmd.aliases.join(', '):''}`]);
      });
      reg('Clear-Host',['cls','clear'], 'Clear the terminal output via the host adapter.', async()=>result([],[],['clear']));
    }
  }

  function formatObjects(values) {
    const clean=values.filter(value=>value!==null && value!==undefined);
    if(!clean.length) return [];
    if(clean.every(v=>v===null || typeof v!=='object')) return clean.map(itemText);
    if(clean.length===1 && typeof clean[0]==='object' && Object.keys(clean[0]).length===1) return [itemText(Object.values(clean[0])[0])];
    const objects=clean.filter(v=>typeof v==='object');
    if(objects.length!==clean.length) return clean.map(itemText);
    const fields=Object.keys(objects[0]).filter(k=>!['FullName','PSIsContainer'].includes(k));
    if(!fields.length) return clean.map(itemText);
    const maxWidths=fields.map(field=>Math.min(35,Math.max(field.length,...objects.map(x=>stringValue(resolveProp(x,[field])).length))));
    const fmt=obj=>fields.map((field,i)=>stringValue(obj[field]).slice(0,maxWidths[i]).padEnd(maxWidths[i])).join('  ').trimEnd();
    const header=fields.map((field,i)=>field.padEnd(maxWidths[i])).join('  ').trimEnd();
    const rule=fields.map((field,i)=>'-'.repeat(maxWidths[i])).join('  ').trimEnd();
    return [header,rule,...objects.map(fmt)];
  }

  return {PowerShellSimulator,VirtualFS,Session,PSError,parse,VERSION};
});
