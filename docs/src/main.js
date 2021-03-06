Vue.component('label-selector', {
  props: ['all-labels'],
  template: document.getElementById('label-selector'),
});

alert('This website is under construction, the content is not ready for any covid-related research or applications.')

function getThumbnail(url, tsize) {
  return new Promise((resolve, reject) => {
    var myCan = document.createElement('canvas');
    var img = new Image();
    img.src = url;
    img.crossorigin = "anonymous";
    img.onload = function () {
      myCan.width = Number(tsize);
      myCan.height = Number(tsize);
      if (myCan.getContext) {
        var cntxt = myCan.getContext("2d");
        cntxt.drawImage(img, 0, 0, myCan.width, myCan.height);
        var dataURL = myCan.toDataURL();
        resolve(dataURL)
      } else {
        reject('unable to get context')
      }
    }
    img.onerror = reject
  })

}

function randId() {
  return Math.random()
    .toString(36)
    .substr(2, 10);
}

function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

const app = new Vue({
  el: '#app',
  data: {
    models: [],
    apps_source: [],
    apps: {},
    allLabels: [],
    filters: [],
    selected_model: {},
    windows: [],
    imjoy: null,
    dialog_window: null,
    loading: false,
    lastModified: null,
    local_file: null,
    watch_timer: null,
    snack_message: null,
    snackbar: null,
    show_models: true,
    selected_window: null
  },
  computed: {
    filteredModels: function () {
      const covered = this.models.filter((model) => model.cover_image);
      const models = covered.concat(this.models.filter((model) => !model.cover_image))

      return models.filter((model) =>
        this.filters.every((label) =>
          model.allLabels.includes(label)
        )
      );

    }
  },
  created: async function () {
    
    const that = this;
    that.models = []
    try {
      let repo = 'bioimage-io/bioimage-io-models'
      const query_repo = getUrlParameter('repo')
      let repository_url = `https://raw.githubusercontent.com/CellProfiling/covid19ai/master/manifest.model.json`
      if(query_repo){
        if(query_repo.startsWith('http') || query_repo.startsWith('/')){
          repository_url = query_repo;
        }
        else if(query_repo.split('/').length === 2){
          repository_url = `https://raw.githubusercontent.com/${query_repo}/master/manifest.model.json`
        }
        else if(query_repo.split('/').length === 3){
          repository_url = `https://raw.githubusercontent.com/${query_repo}/manifest.model.json`
        }
        else{
          alert("Unsupported repo format.")
          throw "Unsupported repo format."
        }

        repo = query_repo;
      }
      
      const response = await fetch(repository_url + '?' + randId())
      const repo_manifest = JSON.parse(await response.text());
      const models = repo_manifest.models;
      for (let model of models) {
        model.repo = repo;
        model.url = model.url;
        model.model_uri = `${repo}:${model.name}`;
        model.source_url = model.url;
        if(!model.config_url.startsWith('http'))
        model.config_url = model.root_url+'/'+model.config_url
      }
      that.models = that.models.concat(models);
      that.apps_source = repo_manifest.applications;
    } catch (e) {
      console.error(e)
      alert(`Failed to fetch manifest file from the repo: ${e}.`)
    }
    
    that.models.forEach((model) => {
      model.allLabels = model.labels || [];
      if (!!model.license) {
        model.allLabels.push(model.license);
      }
      if (model.tags) {
        model.allLabels = model.allLabels.concat(model.tags);
      }
      if (model.covers && model.covers.length>0) {
        // resolve relative path to the cover image
        if(!model.covers[0].startsWith('http')){
          model.cover_image = encodeURI(model.root_url+'/'+model.covers[0])
        }
        else{
          model.cover_image = encodeURI(model.covers[0])
        }
        if(model.cover_image.includes('(') || model.cover_image.includes(')')){
          console.error('cover image file name cannot contain brackets.')
        }
        // TODO: show all the cover images
      } else {
        model.cover_image = ''
      }
    });
    that.models.forEach((model) => {
      model.allLabels.forEach((label) => {
        if (that.allLabels.indexOf(label) === -1) {
          that.allLabels.push(label);
        }
      });
    });
    that.allLabels.sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : 1
    );
    
    if (!that.$refs.model_info_dialog.showModal) {
      dialogPolyfill.registerDialog(that.$refs.model_info_dialog);
    }

    if (!that.$refs.window_dialog.showModal) {
      dialogPolyfill.registerDialog(that.$refs.window_dialog);
    }

    if (!that.$refs.subscription_dialog.showModal) {
      dialogPolyfill.registerDialog(that.$refs.subscription_dialog);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ()=>{
        console.log('Loading ImJoy...')
        that.loadImJoy();
        that.showModelInfo();
        this.snackbar = new window.PatchedMaterialSnackbar(this.$refs.message_snackbar)
      });
    } else {  // `DOMContentLoaded` already fired
      console.log('Loading ImJoy...')
      that.loadImJoy();
      that.showModelInfo();
      this.snackbar = new window.PatchedMaterialSnackbar(this.$refs.message_snackbar)
    }

  },
  mounted(){
    
  },
  methods: {
    showModelInfo(){
      const selected_model = getUrlParameter('model');
      if(selected_model){
        const m = this.models.filter(model=>model.name===selected_model)[0]
        if(m) this.showInfo(m)
      }
    },
    etAl: (authors) => {
      authors = authors.map((author)=>{
        return author.split(';')[0]
      })
      if (authors.length < 3) {
        return authors.join(", ");
      } else {
        return authors.slice(0, 3).join(", ") + " et al.";
      }
    },
    showMessage(message, duration){
      duration = duration || 5000;
      const data = {
        message: message.slice(0,200),
        actionHandler: function(event) {},
        actionText: 'Close',
        timeout: duration
      };
      this.snackbar.hideSnackbar();
      setTimeout(()=>{
        this.snackbar.showSnackbar(data);
      }, 30)
    },
    async getDocs(model) {
      if (model.docs) return;
      model.docs = '@loading...';
      this.$forceUpdate();
      try{
        const response = await fetch(model.root_url+'/'+model.documentation+'?'+randId())
        if(response.status == 200){
          const raw_docs = await response.text();
          if (raw_docs && window.marked && window.DOMPurify) {
            model.docs = window.DOMPurify.sanitize(window.marked(raw_docs))
          } else {
            model.docs = null;
          }
        }
        else{
          model.docs = null;
        }
        
        this.$forceUpdate();
      }
      catch(e){
        model.docs = '';
        this.$forceUpdate();
      }
    },
    share(model) {
      prompt('Please copy and paste following URL for sharing:', 'https://bioimage.io?model=' + encodeURI(model.name))
    },
    showInfo(model) {
      this.selected_model = model;
      this.$refs.model_info_dialog.showModal();
      this.getDocs(model)
    },
    closeInfo() {
      this.$refs.model_info_dialog.close();
    },
    addRemoveToFilters(label) {
      if (this.filters.indexOf(label) === -1) {
        this.filters.push(label);
      } else {
        this.filters = this.filters
          .filter((x) => x !== label);
      }
    },
    checkActive(label) {
      return this.filters.indexOf(label) > -1;
    },
    clearAllFilters() {
      this.filters = [];
    },
    getLabelCount(label) {
      return this.filteredModels
        .filter((models) => models.allLabels.includes(label))
        .length;

    },
    getModelsCount() {
      return this.filteredModels.length
    },
    showSubscriptionForm(){
      if(!this.$refs.subscription_dialog.open)
      this.$refs.subscription_dialog.showModal();
    },
    closeSubscriptionForm(){
      this.$refs.subscription_dialog.close();
    },
    addWindow(w){
      this.selectWindow(w)
      this.show_models = false;
      this.selected_window = w;
      this.$forceUpdate();
    },
    async removeWindow(w){
      w.closing = true;
      await w.close()
      this.show_models = true;
      this.selected_window = null;
      this.$forceUpdate()
    },
    selectWindow(w){
      if(w.closing) return
      this.selected_window = w;
      this.show_models = false;
    },
    closeDialog(){
      this.$refs.window_dialog.close()
    },
    async loadImJoy(){
      const imjoyCore = await loadImJoyCore({version: "0.13.10"})
      const me = this;
      const lazy_dependencies = {};
      var imjoy_api = {
        showStatus(plugin, info){
            me.showMessage(info)
        },
        showMessage(plugin, info, duration){
            me.showMessage(info, duration)
        },
        showProgress(plugin, progress){
            if (progress < 1) progress =  progress * 100;
            me.$refs.progressbar.setProgress(progress);
        },
        showDialog(_plugin, config) {
            return new Promise((resolve, reject) => {
                me.dialog_window = config;
                me.$forceUpdate()
                if (config.ui) {
                  if(!me.$refs.window_dialog.open)
                  me.$refs.window_dialog.showModal();
                  const joy_config = {
                      container:  document.getElementById('window-dialog-container'),
                      init: config.ui || "", //"{id:'localizationWorkflow', type:'ops'} " + // a list of ops
                      data: config.data, // || Joy.loadFromURL(),
                      modules: config.modules || ["instructions", "math"],
                      onexecute: config.onexecute,
                      onupdate: config.onupdate,
                  };
                  try {
                      new imjoyCore.Joy(joy_config);
                  } catch (e) {
                      console.error("error occured when loading the workflow", e);
                      joy_config.data = "";
                      new imjoyCore.Joy(joy_config);
                      throw e;
                  }
          
              } else if (config.type) {
                  if(!me.$refs.window_dialog.open)
                  me.$refs.window_dialog.showModal();
                  config.window_container = "window-dialog-container";
                  config.standalone = true;
                  if (config.type.startsWith("imjoy/")) {
                      config.render = wconfig => {
                      };
                  }
                  setTimeout(() => {
                      imjoy.pm.createWindow(null, config)
                      .then(api => {
                          
                          const _close = api.close;
                          api.close = async () => {
                              await _close();
                              me.closeDialog();
                          };
                          resolve(api);
                      })
                      .catch(reject);
                  }, 0);
              } else {
                  alert("Unsupported dialog type.");
              }
            });
        },
      }

      const imjoy = new imjoyCore.ImJoy({
          imjoy_api: imjoy_api,
      })
      imjoy.event_bus.on('show_message',(msg)=>{
          this.showMessage(msg)
      })
      imjoy.event_bus.on('add_window',(w)=>{
          this.addWindow(w)
      })
      imjoy.pm.imjoy_api.getPlugin = async (_plugin, plugin_name) => {
        const target_plugin = imjoy.pm.plugin_names[plugin_name];
        if (target_plugin) {
          return target_plugin.api;
        } else if (imjoy.pm.internal_plugins[plugin_name]) {
          try{
            this.loading = true;
            this.$forceUpdate()
            const p = await imjoy.pm.reloadPluginRecursively(
              {
                uri: imjoy.pm.internal_plugins[plugin_name].uri,
              },
              null,
              "eval is evil"
            );
            console.log(`${p.name} loaded.`);
            return p.api;
          }
          catch(e){
            console.error(e)
            throw e
          }
          finally{
            this.loading = false;
            this.$forceUpdate()
          }
            
        } else if(lazy_dependencies[plugin_name]){
          try{
            this.loading = true;
            this.$forceUpdate()
            const p = await imjoy.pm.reloadPluginRecursively(
              {
                uri: lazy_dependencies[plugin_name],
              }
            );
            console.log(`${p.name} loaded.`);
            return p.api;
          }
          catch(e){
            console.error(e)
            throw e
          }
          finally{
            this.loading = false;
            this.$forceUpdate()
          }
        } 
        else{
          throw `plugin with type ${plugin_name} not found.`;
        }
      }
      const workspace = getUrlParameter('workspace') || getUrlParameter('w');
      const engine = getUrlParameter('engine') || getUrlParameter('e');

      imjoy.start({workspace: workspace}).then(async ()=>{
          this.windows = imjoy.wm.windows
          console.log('ImJoy started: ', imjoy)
          if (engine) {

          }
          this.loading = true;
          await imjoy.pm.reloadPluginRecursively({uri: 'https://imjoy-team.github.io/jupyter-engine-manager/Jupyter-Engine-Manager.imjoy.html'})
          // await imjoy.pm.reloadInternalPlugins()
          for(let k in this.apps_source){
            try{
              const config = await imjoy.pm.getPluginFromUrl(this.apps_source[k])
              const p = await imjoy.pm.reloadPlugin(config)
              for (let i = 0; i < config.dependencies.length; i++) {
                const d_config = await imjoy.pm.getPluginFromUrl(config.dependencies[i])
                // TODO: use a better way to determin if it's an internal plugin type
                if(imjoy.pm.getBadges(d_config) === '🚀'){
                  lazy_dependencies[d_config.name] = config.dependencies[i]
                }
                else{
                  await imjoy.pm.reloadPluginRecursively(
                    {
                      uri: config.dependencies[i]
                    }
                  );
                }
              }
              if(p.type !== 'window'){
                if(!this.validateBioEngineApp(p.name, p.api))
                continue
              }
              this.apps[k] = p
            }
            catch(e){
              console.error(e)
            }
          }
          this.loading = false;
          this.$forceUpdate()
      })
      .catch((e)=>{
          console.error(e)
          alert('Error: '+ e)
      })

      imjoy.event_bus.on("plugin_loaded", (plugin) => {

      })

      imjoy.event_bus.on("imjoy_ready", () => {

      })
      
      imjoy.event_bus.on("close_window", (w) => {
        if(w.window_container !== "window-dialog-container"){
          this.show_models = true;
          this.$forceUpdate()
        }
      })
      this.imjoy = imjoy;
      console.log('ImJoy loaded successfully.')
    },
    async runManyModels(plugin){
      try{
        this.loading = true;
        if(plugin.type === 'window'){
          const w = await plugin.api.run()
          if(!this.validateBioEngineApp(plugin.name, w)){
            w.runManyModels = w.run;
          }
          await w.runManyModels(this.models)
        }
        else{
          plugin.api.runManyModels(this.models)
        }
      }
      catch(e){
        this.showMessage(e)
        console.error(e)
      }
      finally{
        this.loading = false;
      }
      
    },
    async runOneModel(plugin, model){
      try{
        this.loading = true;
        if(plugin.type === 'window'){
          const w = await plugin.api.run()
          this.validateBioEngineApp(plugin.name, w)
          await w.runOneModel(model)
        }
        else{
          plugin.api.runOneModel(model)
        }
      }
      catch(e){
        this.showMessage(e)
        console.error(e)
      }
      finally{
        this.loading = false;
      }
    },
    fileSelected(){
      this.lastModified = null;
      if (!this.$refs.file_select.files) return;
      this.local_file = this.$refs.file_select.files[0];
      this.lastModified = "old";
      this.showMessage('Loading App...');
      this.watch_timer = setInterval(() => {
        this.$forceUpdate();
        this.loadCodeFromFile(this.local_file);
      }, 1000);
      this.loadCodeFromFile(this.local_file);
    },
    validateBioEngineApp(name, api){
      if(!api.runOneModel && !api.runManyModels){
        console.error(`${name}" has neither "runOneModel" nor "runManyModels":`, api)
        alert(`"${name}" is not a valid BioEngine App, it should define "runOneModel" and/or "runManyModels".`)
        return false
      }
      if(!api.testModel){
        console.warn(`Please define a testModel function for "${name}".`)
      }
      return true
    },
    loadCodeFromFile(file) {
      file = file || this.local_file;
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        this.local_file = file;
        try {
          const code = reader.result;
          if (
            this.lastModified != file.lastModified
          ) {
            this.lastModified = file.lastModified;
            const config = this.imjoy.pm.parsePluginCode(code);
            config.dependencies = config.dependencies || [];
            try {
              this.loading = true;
              for (let i = 0; i < config.dependencies.length; i++) {
                await this.imjoy.pm.reloadPluginRecursively(
                  {
                    uri: config.dependencies[i]
                  }
                );
              }
              const plugin = await this.imjoy.pm.reloadPlugin(config)
              console.log(plugin)
              if(plugin.type !== 'window'){
                this.validateBioEngineApp(plugin.name, plugin.api)
              }
              this.apps[plugin.name] = plugin;
              this.showMessage(`Plugin "${plugin.name}" loaded successfully.`)
              this.$forceUpdate()
              console.log(`Plugin "${plugin.name}" loaded successfully.`)
            } catch (error) {
              this.showMessage(`Failed to load dependencies for ${config.name}: ${error}`);
            }
            finally{
              this.loading = false;
            }
          }
        } catch (e) {
          console.error(e)
          this.showMessage(`Failed to load plugin: ${error}`);
        }
      };
      reader.onerror = e => {
        console.error(e);
        this.showMessage(`Failed to load plugin: ${e}`);
        if (this.watch_timer) {
          clearInterval(this.watch_timer);
        }
        this.watch_file = false;
        this.$forceUpdate();
      };
      reader.readAsText(file);
    },
  }
});