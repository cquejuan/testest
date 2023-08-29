var engine;
var historyScroller;
var menuScroller;
var transcriptScroller;
(function($){
	
	//Set window events after creating the engine
	var init = function()
	{
		// Create main instance of the engine
		engine = new Engine();

		Utils.browserDetection.init();
		Utils.debug.trace('Browser: ' + Utils.browserDetection.details);
		
		// Setup window events
		window.onresize = function()
		{
			engine.handleResize();
		};
		window.onbeforeunload = function(e)
		{
			var e = e || window.event;
			
			if (Conf.API_TYPE == 'AICC'){
				if (!engine.started){
					return;
				} else {
					if (!engine.quit){
						engine.comm.commit();
						if (e) {
						e.returnValue = Lang.AICC_CHECK_BEFORE_UNLOAD;
						}
						return Lang.AICC_CHECK_BEFORE_UNLOAD;
					}
				}
			}
			// Safari doesn't like calling method
			//engine.checkBeforeExit(e);
		};
		window.onunload = function()
		{
			engine.terminate();
		};

		if(Utils.browserDetection.isMobile())
		{
			document.addEventListener('touchmove', function (e) { e.preventDefault(); }, false);

			window.addEvent('orientationchange', function() {
			    engine.onOrientationChange();
			});
		}
		
		//Initialize the engine
		engine.initialize();
	};

    window.addEvent('load', function(){
        init();
    });

})(document.id);
