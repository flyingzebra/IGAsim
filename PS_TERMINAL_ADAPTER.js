/* Generic host adapter; COM_TERM.js is used as supplied, without PowerShell edits. */
(function (root) {
  'use strict';
  function escapeMarkup(value) {
    return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  class EngineRegistry {
    constructor() { this.factories = new Map(); }
    register(name,factory) {
      if (!name || typeof factory !== 'function') throw new TypeError('Provide engine name and factory.');
      this.factories.set(name,factory);
    }
    create(name) {
      const factory=this.factories.get(name);
      if(!factory) throw new Error('Unknown simulator engine: '+name);
      const engine=factory();
      for(const method of ['execute','getPrompt','reset']) {
        if(typeof engine[method]!=='function') throw new Error(`Engine ${name} must implement ${method}().`);
      }
      return engine;
    }
    names() { return [...this.factories.keys()]; }
  }
  class TerminalEngineAdapter {
    constructor(terminal,engine,options={}) {
      this.terminal=terminal;
      this.engine=engine;
      this.busy=false;
      this.onStatus=options.onStatus||function(){};
      this.queue=Promise.resolve();
      this.syncPrompt();
      terminal.onInput((_command,_params,line) => {
        // COM_TERM expects a synchronous Boolean; execution is queued afterwards.
        this.submit(line);
        return true;
      });
    }
    syncPrompt() {
      // Safe escaped markup; avoid changing generic COM_TERM or using global DOM selectors.
      this.terminal.pushPrompt(escapeMarkup(this.engine.getPrompt()),{separator:'',replace:true});
    }
    submit(source) {
      this.queue=this.queue.catch(()=>{}).then(()=>this.run(source));
      return this.queue;
    }
    async run(source) {
      this.busy=true;
      this.onStatus('Running');
      try {
        const reply=await this.engine.execute(String(source));
        for (const effect of reply.effects || []) if (effect === 'clear') this.terminal.clear();
        for (const line of reply.output || []) this.terminal.write(String(line)+'\n','rx');
        for (const error of reply.errors || []) this.terminal.write(String(error)+'\n','meta');
        this.syncPrompt();
        this.onStatus(reply.success?'Ready':'Error');
        return reply;
      } catch(error) {
        this.terminal.write('Engine error: '+(error?.message||String(error))+'\n','meta');
        this.onStatus('Error');
        return {success:false,output:[],errors:[String(error)],effects:[]};
      } finally {this.busy=false;}
    }
    async reset() {
      await this.queue.catch(()=>{});
      this.engine.reset();
      this.terminal.clear();
      this.syncPrompt();
      this.terminal.write('Virtual session reset.\n','meta');
      this.onStatus('Ready');
    }
    async switchEngine(engine) {
      await this.queue.catch(()=>{});
      this.engine=engine;
      this.terminal.clear();
      this.syncPrompt();
      this.terminal.write('Simulator engine switched.\n','meta');
    }
  }
  root.PowerShellTerminal={EngineRegistry,TerminalEngineAdapter};
})(typeof globalThis!=='undefined'?globalThis:this);
