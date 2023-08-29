/**
* Creates a new instance of an Assessment object
* @classDescription This class defines assessments and their behavior
* @param {Object} o	A param that specifies the Assessment class configuration (adopted from parent page)
* @requires Engine
* @requires Utils
* @constructor
*/
function Assessment(parentPageObj,o)
{
	// Loop over the params in object "o" and add them to this object
	for (var prop in o) 
	{
		this[prop] = o[prop];
	}
	
	// Default assesment properties
	this.parentPageObj = parentPageObj;
	
	// Array for all questions
	this.questions = [];
	
	// Array of questions used by assessment
	this.questionList = [];
	 
	this.quesTotal = 0;
	this.realQuesTotal = 0;
	this.currentQues = 0
	this.currentQuesObj;
	this.contentDoc;
	this.contentFrame;
	this.completed = false;
	this.passed = false;
	this.score = 0;
	this.prevScore = null;
	this.isInteraction = false;
	this.bypassed = false;
	this.correctQuestionsRemaining = 0;
	this.passingScore = Conf.PASSING_SCORE;
	this.totalIncorrect = 0;
	this.incNumberList = [];
	this.currentSimMode = 0;
	this.inSummary = false;
	this.isAssessImgError = false;
	this.isAssessImgLoaded;
	this.assessImgLoadedCount;
	
	/**
	 * Adds a question instance to the assessment
	 * @method addQuestion
	 * @param {q} Question The question instance to be added to the assessment
	 */
	this.addQuestion = function(q)
	{
		
		// Insert a reference to this assessment into the question being added
		q.assessment = this;
		
		q.orgIndex = q.index = this.questions.length;
		
		// Set the question number, index, update the question total
		// Add the question object to the questions array
		q.quesNo = this.quesTotal = this.realQuesTotal = this.questions.push(q);
	};
	
	/**
	 * Initializes the assessment
	 * @method init
	 */
	this.init = function()
	{
		// Let's cache off whether or not we're in the summary page. Default is false.
		this.inSummary = false;

		// Set references to the content frame's DOM elements
		this.contentFrame = window.frames.content;
		this.contentDoc = (content.contentDocument || $("content").contentWindow.document);
		
		// Set references to the assessment button elements within the assessment.htm stencil
		this.btnContinue = this.contentDoc.id("btnContinue");
		this.btnRetry =  this.contentDoc.id("btnRetry");
		this.btnReset =  this.contentDoc.id("btnReset");
		this.btnShowMe =  this.contentDoc.id("btnShowMe");
		if (this.contentDoc.getElementById('btnSkipSim')) {
			this.btnSkipSim = this.contentDoc.id("btnSkipSim");
		}

		this.btnContinue.value = unescape(Lang.UI_LABEL_CONTINUE);
		this.btnRetry.value = unescape(Lang.UI_LABEL_RETRY);
		this.btnReset.value = unescape(Lang.UI_LABEL_RESET);
		this.btnShowMe.value = unescape(Lang.UI_LABEL_SHOW_ME);
		if (this.contentDoc.getElementById('btnSkipSim')) {
			this.btnSkipSim.value = unescape(Lang.UI_LABEL_SKIP_SIM);
		}

		this.waitingLoadImage = this.contentDoc.getElementById('waitingLoadImage');
		
		// If this assessment has more than one question, or it is set as a post-assessment,
		// we know it isn't an interaction.  Otherwise, it is.
		if(this.quesTotal > 1 || this.isPostAssessment)
		{
			this.isInteraction = false;
		}
		else
		{
			this.isInteraction = true;
			this.feedbackEnabled = true;
			this.retakeAllowed = true;
		}
		
		var self = this;

		if(!this.isInteraction)
		{
			// Set default functionality of the assessment buttons 
			if(Utils.browserDetection.isMobile())
			{
				this.btnContinue.ontouchend = function(e)
				{
					setTimeout(function(){self.startAssessment();},0);
				};
			}
			else
			{
				this.btnContinue.onclick = function()
				{
					var myElements = self.contentDoc.getElementsByTagName('object');
					if (myElements.length == 1){
						var wmp = new Object();
						wmp = myElements[0];
						if ($chk(wmp.object)){
							wmp.object.controls.stop();
						}
					}
					self.startAssessment();
				};
			}
		}
		
		this.btnRetry.onclick = function()
		{
			self.retry();
		};
		this.btnReset.onclick = function()
		{
			self.resetInteraction();
		};
		this.btnShowMe.onclick = function()
		{
			self.showMe();
		};
		if (this.contentDoc.getElementById('btnSkipSim')) {
			this.btnSkipSim.onclick = function()
			{
				var message = unescape(Lang.SKIP_SIMULATION_WARNING_MSG);
				
				var skip = confirm(message);
				if (skip){
				self.skipSim();
				} else {
					return;
				}
				
			};
		}
		
		Utils.dom.setStyleById('btnRetry', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById('btnReset', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById('btnShowMe', 'display', 'none', '', this.contentDoc);
		if (this.contentDoc.getElementById('btnSkipSim')) {
			Utils.dom.setStyleById('btnSkipSim', 'display', 'none', '', this.contentDoc);
		}
		Utils.dom.setStyleById('loc', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById('directions', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById('contentForm', 'display', 'none', '', this.contentDoc);
		
		// If this is a post assessment, handle LMS data and "retake scenarios"
		if(this.isPostAssessment)
		{
			// Has this post assessment been completed already?
			if(this.completed)
			{
				this.prevScore = engine.comm.getScore();
				this.prevCompletionStatus = engine.comm.getCompletionStatus();
				this.prevSuccessStatus = engine.comm.getSuccessStatus();
				
				if(this.retakeAllowed) // Retake is allowed
				{
					if(this.prevScore >= this.passingScore)
					{
						// Retake is allowed. However, this assessment has already been passed, so bypass it.
						this.bypassAssessment();
						return;
					}

					if(!isNaN(parseInt(this.prevScore)) && (this.prevScore > 0) && (this.prevScore < 100))
					{
						// Reinstantiate question list from suspend_data only if
						// incorrect questions from previous session is allowed
						if(this.onlyRetakeIncorrect)
						{
							if(!this.passed)
							{
								// Get the existing question list from suspend_data
								this.setQuestionListFromIncorrect();
							}
							else
							{
								// Retake is allowed, and is limited to incorrect questions
								// However, this assessment has already been passed, so bypass it.
								this.bypassAssessment();
								return;
							}
						}
						else
						{
							// Retake is allowed, and it isn't limited to incorrect questions. Use all questions.
							this.setQuestionList();
						}
					}
					else
					{
						// Retake is allowed, but a previous score of "0" or "100" exists. Use all questions.
						this.setQuestionList();
					}
				}
				else // Retake is not allowed
				{
					this.bypassAssessment();
					return;
				}
			}
			else
			{
				// Assessment has not yet been completed. Use all questions.
				this.setQuestionList();
			}
		}
		else
		{
			// Not a post assessment. Use all questions.
			this.setQuestionList();
		}
		
		// If we revisit this assessment, we need to reset all interaction properties
		this.resetQuestions();
		
		// Set the default question values to begin at the first question
		this.currentQues = 0;
		this.currentQuesObj = this.questionList[0];
		// check if there are any questions in the list; otherwise do not display continue button
		if (this.questionList.length == 0 && this.questionList[(this.currentQues + 1)] == undefined) {
			Utils.dom.setStyleById('btnContinue', 'display', 'none', '', this.contentDoc);
		}
		else
		{
			if (this.isPostAssessment){
			if(Conf.ENABLE_TRANSITIONS && Utils.browserDetection.browser == "ie" && Utils.browserDetection.version == 8) {
				var self = this;
				setTimeout(function(){
					Utils.dom.setStyleById('btnContinue', 'display', 'inline', '', self.contentDoc);
				},10);
			} else {
				Utils.dom.setStyleById('btnContinue', 'display', 'inline', '', this.contentDoc);
			}
			}
		}
		
		// If this is an interaction...
		if(this.isInteraction)
		{
			// No need for a start page, go ahead and start.
			this.startAssessment();
		}
	};
	
	/**
	 * Bypasses assessment using the previous score to display after loading the summary page
	 * @method startAssessment
	 */
	this.startAssessment = function()
	{
		// If this is a post assessment, lock the user into completing it
		if(this.isPostAssessment) 
		{
			engine.controller.enableAssessmentMode();
		}
		
		var self = this;
		if(Utils.browserDetection.isMobile())
		{
			this.btnContinue.ontouchend = function(e)
			{
				setTimeout(function(){self.check();},0);
			};
		}
		else
		{
			this.btnContinue.onclick = function()
			{
				self.check();
			};
		}
		
		Utils.dom.setStyleById('pageContent', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById('loc', 'display', 'block', '', this.contentDoc);
		Utils.dom.setStyleById('directions', 'display', 'block', '', this.contentDoc);
		Utils.dom.setStyleById('contentForm', 'display', 'block', '', this.contentDoc);

		// This question may have audio
		this.loadQuestionAudio();
		
		// Render the first question
		// Wrap in timeout - DnD's break on iOS otherwise - UPC-13604
		setTimeout(function(){self.render();},0);
	}
	
	/**
	 * Bypasses assessment using the previous score to display after loading the summary page
	 * @method bypassAssessment
	 */
	this.bypassAssessment = function()
	{
		// We're going to bypass the assessment and move directly to the summary page...
		this.inSummary = true;

		if(!isNaN(parseInt(this.prevScore)) && (this.prevScore != null))
		{
			this.score = this.prevScore;
		}
		// Bump the user to the Summary page.
		this.bypassed = true;
		engine.setContentSrc(engine.assessmentSummaryPath);
		engine.controller.disableAssessmentMode();
	}

	/**
	 * Sets up the question list based on question pool and randomization settings
	 * @method setQuestionList
	 */
	this.setQuestionList = function()
	{
		// Setup question pool
		if(this.pool) 
		{
			// Make sure there are more existing questions than there are for the pool
			if(this.poolTotal < this.quesTotal) 
			{
				// Create a copy of the total questions.
				tmp = this.questions.slice(0);

				// Always randomize if there is a question pool
				this.randQuestions(tmp);

				// Set the default question list based on all available questions
				this.questionList = tmp.slice(0,this.poolTotal);
			
				Utils.debug.trace('Questions From Pool:');
				for(var i=0;i<this.questionList.length;i++)
				{
					Utils.debug.trace('Question '+(i+1)+' (Original question index: '+this.questionList[i].orgIndex+')');
				}
			
				// We have a valid question pool scenario, set the question total
				// to that of the total desired number of questions in the pool
				this.quesTotal = this.realQuesTotal = this.poolTotal;
			}
			else // Not enough questions for pool, or they are equal lengths
			{
				// Set the default question list based on all available questions
				this.questionList = this.questions.slice(0);
				
				// No question pool. Should we randomize the questions?
				if(this.randomQuestions)
				{
					this.randQuestions(this.questionList);
				}
			}
		}
		else // No pool
		{
			// Set the default question list based on all available questions
			this.questionList = this.questions.slice(0);
			
			// No question pool. Should we randomize the questions?
			if(this.randomQuestions)
			{
				this.randQuestions(this.questionList);
			}
		}
	};
	
	/**
	 * Sets up the question list from the list of persisted indexes of questions
	 * answered incorrectly if "onlyRetakeAllowed" is true
	 * @method setQuestionListFromIncorrect
	 */
	this.setQuestionListFromIncorrect = function()
	{
		// Serialized incorrect question data.  Example: 1|0-2|2
		// Returned from controller already split on "-" into separate question data
		var incQuesArray = engine.controller.getIncQuestionList();
		var incQuesTotal = incQuesArray.length;
		
		this.correctQuestionsRemaining = this.realQuesTotal - incQuesTotal;
		
		Utils.debug.trace('Retake allowed - Resetting previous incorrect questions...');
		Utils.debug.trace(' - Original total questions: '+this.realQuesTotal);
		Utils.debug.trace(' - Previously answered incorrect question total: '+incQuesTotal);
		Utils.debug.trace(' - Previously answered correct question total: '+this.correctQuestionsRemaining);
		
		// Do we have a valid "incorrect question array"
		if((incQuesArray !== null) && (incQuesArray.length > 0))
		{
			// Truncate the question list container
			this.questionList = [];
			
			Utils.debug.trace('Retrieving Incorrect Question List: '+incQuesArray);

			// Question data is persisted with "-" delimeter
			// Question index and its "original" index are separated with "|" delimeter
			
			// Loop over questions and push its "real" question object
			// into the list of questions to display
			for(i=0; i < incQuesArray.length; i++)
			{
				tempIncQuesArray = incQuesArray[i].split("|");

				var origQuestionIndex = tempIncQuesArray[0];
				var origQuestionOrgIndex = tempIncQuesArray[1];
				
				var quesObj = this.getQuestionByIndex(origQuestionOrgIndex);
				this.questionList.push(quesObj);
			}
			
			this.quesTotal = this.questionList.length;
		}
		else
		{
			// The incorrect question list isn't any good, set to all questions
			this.questionList = this.questions.slice(0);
			
			// Should we randomize the questions?
			if(this.randomQuestions)
			{
				this.randQuestions(this.questionList);
			}
		}
	};
	
	/**
	 * Returns a question by its index within the main questions array
	 * @method getQuestionByIndex
	 */
	this.getQuestionByIndex = function(index)
	{
		Utils.debug.trace('Getting question by index: '+index+' ('+this.questions[index].stem+')');
		return this.questions[index];
	};
	
	/**
	 * Returns the assessment score number of correct answers in percentage
	 * @method getScore
	 */
	this.getScore = function()
	{
		Utils.debug.trace('Getting score...');
		Utils.debug.trace(' - Total questions this session: '+this.quesTotal);
		Utils.debug.trace(' - Original "real" total questions: '+this.realQuesTotal);
		Utils.debug.trace(' - Computed question total: '+(this.quesTotal+this.correctQuestionsRemaining));
		
		this.totalIncorrect = 0;
		this.incNumberList = [];
		for (var i = 0; i < this.quesTotal; i++) 
		{
			// Get total incorrect
			if(!this.questionList[i].isCorrect(this.contentDoc)) 
			{
				//this.totalIncorrect++;
				this.incNumberList.push(this.questionList[i].quesNo);
			}
		}
		var totalCorrect = (this.quesTotal+this.correctQuestionsRemaining) - this.totalIncorrect;
		var score = Math.round((totalCorrect / (this.quesTotal+this.correctQuestionsRemaining)) * 100);
		return score;
	};
	
	/**
	 * Reloads the assessment HTML page after clicking the "Retake Assessment" button on the summary page
	 * @method retakeAssessment
	 */
	this.retakeAssessment = function()
	{
		// Reload the assessment HTML page
		var pageName = engine.controller.currentPageObj.name;
		engine.controller.gotoPageByName(pageName);
	};
	
	/**
	 * Resets all questions in the assessment back to their original state
	 * @method resetQuestions
	 */
	this.resetQuestions = function()
	{
		for (var i = 0; i < this.questions.length; i++) 
		{
			if(!this.questionList[i].isCorrect(this.contentDoc)){
				this.questions[i].reset();
			}
			this.questions[i].attempts = 0;
		}
	};

	/**
	 * Resets the feedback elements to their original state
	 * @method resetFeedback
	 */
	this.resetFeedback = function()
	{
		Utils.dom.setStyleById(this.currentQuesObj.name + '_corFb', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById(this.currentQuesObj.name + '_incFb', 'display', 'none', '', this.contentDoc);
	};
	
	/**
	 * Randomizes the assessment questions
	 * @method randQuestions
	 */
	this.randQuestions = function(a)
	{
		Utils.array.fisherYates(a);
		this.fixIndexes();
	};
	
	/**
	 * Fixes the question indexes in the case of question randomization
	 * @method fixIndexes
	 */
	this.fixIndexes = function()
	{
		for (var i = 0; i < this.questions.length; i++) 
		{
			this.questions[i].index = parseInt(i, 10);
		}
	};
	
	/**
	 * Checks for assessment completion by checking if each question has been answered
	 * @method isAssessmentCompleted
	 */
	this.isAssessmentCompleted = function()
	{
		for (var i = 0; i < this.questionList.length; i++) 
		{
			if (!this.questionList[i].isAnswered(this.contentDoc)) 
			{
				return false;
			}
		}
		return true;
	};
	
	/**
	 * Returns the current question object
	 * @method getQuestionObj
	 */
	this.getQuestionObj = function()
	{
		return this.currentQuesObj;
	};
	
	/**
	 * Sends the assessment results to the engine
	 * @method sendResults
	 */
	this.sendResults = function()
	{
		var o = {};

		o.score = this.score;
		o.passed = this.passed;
		o.totalToInclude = this.realQuesTotal;
		o.totalIncorrect = this.totalIncorrect;
		o.incNumberList = this.incNumberList.sort().join(",");
		
		engine.comm.sendResults(o);
	};
	
	/**
	 * Renders the current question and manages assessment state
	 * @method render
	 */
	this.render = function()
	{
		var qType = this.currentQuesObj.quesType;
		this.currentSimMode = 0;
		this.contentFrame.Hotspot.removeHotspots();
		this.contentFrame.Zoom.removeZoomButtons();
		this.contentFrame.hidePopups();
		Utils.dom.setStyleById('assessmentButtons', 'display', 'none', '', this.contentDoc);
		var contentHeight = $('content').clientHeight;
		parsedHeight = new Number(contentHeight/2).toFixed();
		this.hideContent();
		Utils.dom.setStyleById(this.waitingLoadImage, 'display', 'block', '', this.contentDoc);
		Utils.dom.setStyleById(this.waitingLoadImage, 'height', parsedHeight + 'px', '', this.contentDoc);
		
		this.assessImgLoadedCount = 0;

		this.btnContinue.blur();
		
		Utils.dom.setStyleById('btnRetry', 'display', 'none', '', this.contentDoc);

		this.renderTranscript();
				
		// User has not completed the assessment, move on to the next question
		Utils.dom.renderHTML("assessmentFeedback", "", this.contentDoc);
		
		if(this.isInteraction)
		{
			Utils.dom.setStyleById('loc', 'display', 'none', '', this.contentDoc);
		}
		else
		{
			var quesXofX = unescape(Lang.UI_LABEL_QUESTION_NUMBER.replace('%s',(this.currentQues + 1)).replace('%t',this.quesTotal));
			Utils.dom.renderHTML("loc", quesXofX, this.contentDoc);
		}
		
		if(this.currentQuesObj.quesType == "Sim")
		{	
			Utils.dom.renderHTMLclass("directions", unescape(this.currentQuesObj.directions), this.contentDoc,"uiContentTitle");			
		}
		else
		{			
		Utils.dom.renderHTML("directions", unescape(this.currentQuesObj.directions), this.contentDoc);
		}

		Utils.dom.renderHTML("assessmentFormContent", this.currentQuesObj.render(), this.contentDoc);
		
		this.currentQuesObj.init(this.contentFrame);

		if(this.currentQuesObj.updatePositions)
		{
			this.contentFrame.removeEvent('resize', this.addUpdatePositionsListener);
			this.contentFrame.addEvent('resize', this.addUpdatePositionsListener);
		}

		this.contentFrame.scrollTo(0,0);

		this.contentFrame.createMobileScroller();
		
	};
	
	this.renderRemaining = function()
	{
		var qType = this.currentQuesObj.quesType;
		
		this.contentDiv = this.contentDoc.getElementById('contentDiv');
		Utils.dom.setOpacity(100, this.contentDiv, this.contentDoc);
		Utils.dom.setStyleById(this.waitingLoadImage, 'display', 'none', '', this.contentDoc);
		
		// Sim interactions do not use the standard interaction buttons.
		// Simulations will attempt to auto-advance to the next question,
		// or display the feedback, if enabled.
		if(this.currentQuesObj.quesType == "Sim")
		{
			Utils.dom.setStyleById('assessmentButtons', 'display', 'none', '', this.contentDoc);
		}
		else 
		{
			// Display the button container, if it has been hidden
			Utils.dom.setStyleById('assessmentButtons', 'display', 'block', '', this.contentDoc);
			if (this.contentDoc.getElementById('btnSkipSim')) {
				Utils.dom.setStyleById('btnSkipSim', 'display', 'none', '', this.contentDoc);
			}
			
			// If this assessment is a post assessment, do not allow them to retry until correct.
			if (this.isPostAssessment) 
			{
				Utils.dom.setStyleById('btnContinue', 'display', 'inline', '', this.contentDoc);
				Utils.dom.setStyleById('btnShowMe', 'display', 'none', '', this.contentDoc);
				
				// DragDrop & HotSpot interactions require a reset button in post assessment mode
				if (qType === "DragDrop" || qType === "HotSpot") 
				{
					Utils.dom.setStyleById('btnReset', 'display', 'inline', '', this.contentDoc);
					this.btnReset.disabled = true;
				}
				else 
				{
					Utils.dom.setStyleById('btnReset', 'display', 'none', '', this.contentDoc);
				}
			}
			else 
			{
				Utils.dom.setStyleById('btnContinue', 'display', 'inline', '', this.contentDoc);
				
				// DragDrop & HotSpot interactions require both reset and "show me" buttons
				if (qType === "DragDrop" || qType === "HotSpot")
				{
					Utils.dom.setStyleById('btnReset', 'display', 'inline', '', this.contentDoc);
					Utils.dom.setStyleById('btnShowMe', 'display', 'inline', '', this.contentDoc);
					this.btnReset.disabled = true;
				}
				else 
				{
					Utils.dom.setStyleById('btnReset', 'display', 'none', '', this.contentDoc);
					Utils.dom.setStyleById('btnShowMe', 'display', 'none', '', this.contentDoc);
				}
			}
		}
		
		this.currentQuesObj.pushZoomButtons(this.contentFrame);
		this.currentQuesObj.pushHotspots(this.contentFrame);
		
		this.contentFrame.Zoom.createZoomButtons();
		this.contentFrame.Hotspot.createHotspots();
		
		if (qType === "Sim" || qType === "MultiChoice" || qType === "MultiCorrect") {
			this.currentQuesObj.focus();
		}
	};

	this.addUpdatePositionsListener = function (e)
	{
		// Yes, the whole path...
		engine.controller.currentPageObj.assessment.currentQuesObj.updatePositions(e);
	};
	
	this.hideContent = function()
	{
		//if(this.isPostAssessment)
		//{
			this.contentDiv = this.contentDoc.getElementById('contentDiv');
			Utils.dom.setOpacity(0, this.contentDiv, this.contentDoc);
		//}
	};
	
	/**
	 * Renders the feedback for the answered question, if feedback is enabled
	 * @method renderQuestionFeedback
	 */
	this.renderQuestionFeedback = function()
	{
		Utils.dom.setStyleById('btnReset', 'display', 'none', '', this.contentDoc);
		Utils.dom.setStyleById('btnShowMe', 'display', 'none', '', this.contentDoc);
		// if answered, disable skip sim and enable continue button
		if (Conf.ENABLE_SKIP_SIM_BUTTON){
			Utils.dom.setStyleById('btnSkipSim', 'display', 'none', '', this.contentDoc);
			Utils.dom.setStyleById('btnContinue', 'display', 'inline', '', this.contentDoc);
		}

		if(this.currentQuesObj.quesType == "Sim" && this.isInteraction)
		{
			Utils.dom.setStyleById('assessmentButtons', 'display', 'block', '', this.contentDoc);
		}
		
		this.currentQuesObj.disable();
		
		if(this.currentQuesObj.persistChoice)
		{
			Utils.dom.setStyleById(this.currentQuesObj.name + '_persistFb', 'display', 'block', '', this.contentDoc);
			Utils.dom.fadeIn(this.currentQuesObj.name + '_persistFb',null,this.contentDoc);
		}
		
		var correct = this.currentQuesObj.isCorrect(this.contentDoc);
		if(correct) 
		{
			Utils.dom.setStyleById(this.currentQuesObj.name + '_incFb', 'display', 'none', '', this.contentDoc);
			Utils.dom.setStyleById(this.currentQuesObj.name + '_corFb', 'display', 'block', '', this.contentDoc);
			Utils.dom.renderHTML(this.currentQuesObj.name + '_corFb', unescape(this.currentQuesObj.corFb), this.contentDoc);
			Utils.dom.fadeIn(this.currentQuesObj.name + '_corFb',null,this.contentDoc);
			if(this.isInteraction)
			{
				if(this.currentQuesObj.quesType != "Sim") 
				{
					//Utils.dom.fadeOut(this.contentDoc.id('assessmentButtons');
					Utils.dom.setStyleById('assessmentButtons', 'display', 'none', '', this.contentDoc);
				}
				else
				{
					Utils.dom.setStyleById('assessmentButtons', 'display', 'none', '', this.contentDoc);
				}
			}
		}
		else 
		{
			Utils.dom.setStyleById(this.currentQuesObj.name + '_corFb', 'display', 'none', '', this.contentDoc);
			Utils.dom.setStyleById(this.currentQuesObj.name + '_incFb', 'display', 'block', '', this.contentDoc);
			
			this.currentQuesObj.attempts++;
			if(this.currentQuesObj.attempts > 1)
			{
				Utils.dom.renderHTML(this.currentQuesObj.name + '_incFb', unescape(this.currentQuesObj.incFb2), this.contentDoc);
			}
			else
			{
				Utils.dom.renderHTML(this.currentQuesObj.name + '_incFb', unescape(this.currentQuesObj.incFb), this.contentDoc);
			}

			Utils.dom.fadeIn(this.currentQuesObj.name + '_incFb',null,this.contentDoc);
			
			if(this.isPostAssessment && !this.isInteraction)
			{
				Utils.dom.setStyleById('btnContinue', 'display', 'inline', '', this.contentDoc);
			}
			else
			{
				Utils.dom.setStyleById('btnContinue', 'display', 'none', '', this.contentDoc);
				Utils.dom.setStyleById('btnRetry', 'display', 'inline', '', this.contentDoc);
			}
		}
	};

	/**
	* Renders the contents of the transcript pane
	* @method renderTranscript
	*/
	this.renderTranscript=function()
	{
		if(!this.isInteraction)
		{
			var quesXofX = Lang.ASSESSMENT_QUESTION +' '+ (this.currentQues + 1) + '/' + this.quesTotal;

			var headerTxt = unescape(Lang.UI_LABEL_TRANSCRIPT)+": " + unescape(quesXofX);
			var transcriptTxt = unescape(this.currentQuesObj.transcriptOverride);

			engine.ui.transcriptHeaderText.innerHTML = headerTxt;
			engine.ui.transcriptText.innerHTML = transcriptTxt;
		}
		else
		{
			engine.ui.renderTranscript();
		}
	};
	
	/**
	 * Returns an array of incorrect questions in format capable of being persisted
	 * @method getIncQuestionList
	 */
	this.getIncQuestionList = function()
	{
		var a = [];
		for(var i = 0;i<this.quesTotal;i++)
		{
			if(!this.questionList[i].correct)
			{
				a.push(this.questionList[i].index+'|'+this.questionList[i].orgIndex);
			}
		}
		return a;
	};
	
	/**
	 * Returns whether or not the assessment has been completed
	 * @method checkCompletion
	 */
	this.checkCompletion = function()
	{
		return (this.currentQues >= (this.quesTotal - 1));
	};
	
	/**
	 * Ends the assessment, sends the appropriate data to Comm object for LMS and loads the summary page
	 * @method endAssessment
	 */
	this.endAssessment = function()
	{
		this.inSummary = true;

		engine.controller.audioStop();

		// Set the score
		this.score = this.getScore();
		if(this.score >= this.passingScore)
		{
			// Passed
			var completionStatus = engine.controller.completionStrings.completed;
			var successStatus = 'passed';
			this.passed = true;
			this.parentPageObj.passed = true;
			this.parentPageObj.failed = false;
			if(this.onlyRetakeIncorrect)
			{
				engine.controller.clearIncQuestionList();
			}
		}
		else
		{
			// Failed
			var completionStatus = engine.controller.completionStrings.incomplete;
			var successStatus = 'failed';
			this.passed = false;
			this.parentPageObj.passed = false;
			this.parentPageObj.failed = true;
			
			if(this.onlyRetakeIncorrect)
			{
				var a = this.getIncQuestionList();
				Utils.debug.trace('Saving Incorrect Question List: '+a.join("-"));
				engine.controller.setIncQuestionList(a);
				engine.controller.setSuspendData();
			}
		}
		
		// Set LMS values if we're in the post assessment
		if(this.isPostAssessment)
		{
			// Ensure that we suspend the current course state, now that we're done
			engine.controller.setCourseState();
			engine.controller.setSuspendData();
			
			// Do checks for previous status, then set the status, if applicable
			var prevCompletionStatus = engine.comm.getCompletionStatus();
			if(prevCompletionStatus && (prevCompletionStatus != undefined))
			{
				// Is the previous score higher than this one?
				if(prevCompletionStatus.toLowerCase().charAt(0) == "c" || prevCompletionStatus.toLowerCase().charAt(0) == "p")
				{
					// Do we allow overwriting of previous status?
					if(Conf.OVERWRITE_PREV_COMPLETION_STATUS)
					{
						// Yes, status was either "completed" or "passed" already, but we allow it to be overwritten
						engine.comm.setCompletionStatus(completionStatus);
					}
				}
				else
				{
					// Status is neither "completed" or "passed", so we'll overwrite the existing status
					engine.comm.setCompletionStatus(completionStatus);
				}
			}
			else
			{
				// No existing completion status, set it
				engine.comm.setCompletionStatus(completionStatus);
			}
			
			// Do checks for previous status, then set the status, if applicable
			var prevSuccessStatus = engine.comm.getSuccessStatus();
			if(prevSuccessStatus && (prevSuccessStatus != undefined))
			{
				// Is the previous score higher than this one?
				if(prevSuccessStatus.toLowerCase().charAt(0) == "p")
				{
					// Do we allow overwriting of previous status?
					if(Conf.OVERWRITE_PREV_SUCCESS_STATUS)
					{
						// Yes, status was "passed" already, but we allow it to be overwritten
						engine.comm.setSuccessStatus(successStatus);
					}
				}
				else
				{
					// Status is not "passed", so we'll overwrite the existing status
					engine.comm.setSuccessStatus(successStatus);
				}
			}
			else
			{
				// No existing success status, set success_status
				engine.comm.setSuccessStatus(successStatus);
			}

			// Do checks for previous score, then set the score, if applicable
			if(!isNaN(parseInt(this.prevScore)) && (this.prevScore != null))
			{
				// Is the previous score higher than this one?
				if(this.prevScore > this.score)
				{
					// Do we allow overwriting of previous score if higher than this score?
					if(Conf.OVERWRITE_PREV_HIGHER_SCORE)
					{
						// Yes, the previous score was higher, but we'll allow it to be overwritten
						engine.comm.setScore(this.score);
					}
				}
				else
				{
					// This score is higher than the previous, so we'll simply overwrite the previous
					engine.comm.setScore(this.score);
				}
			}
			else
			{
				// No previous score, so set this one automatically
				engine.comm.setScore(this.score);
			}
			
			engine.comm.commit();
		}
		
		if(!this.isInteraction) 
		{
			// Re-enable the navigation.
			if(this.isPostAssessment) 
			{
				engine.controller.disableAssessmentMode();
				engine.ui.renderTranscript();
			}
			
			// We're inside an assessment and complete - Bump the user to the Summary page.
			engine.setContentSrc(engine.assessmentSummaryPath);
			return;
		}
	}
	
	/**
	 * Checks whether or not the question has been answered, sets the student response,
	 * and either moves the learner to the next question or displays feedback, if feedback is enabled.
	 * @method check
	 */
	this.check = function()
	{
		// Grab the current question object
		var q = this.currentQuesObj;
		
		// Check if the question is answered before moving on
		if(q.isAnswered())
		{
			// Set the student's response
			q.setStudentResponse();
			
			// Set the interactions result
			q.setInteractionResult();
			
			// Debug
			Utils.debug.trace('Question '+(this.currentQues + 1)+': index: ' + this.currentQuesObj.index + ' type: ' + this.currentQuesObj.quesType);
			Utils.debug.trace('Question '+(this.currentQues + 1)+': index: ' + this.currentQuesObj.index + ' answered: ' + this.currentQuesObj.isAnswered());
			Utils.debug.trace('Question '+(this.currentQues + 1)+': index: ' + this.currentQuesObj.index + ' correct: ' + this.currentQuesObj.isCorrect());
			Utils.debug.trace('Question '+(this.currentQues + 1)+': index: ' + this.currentQuesObj.index + ' response: ' + this.currentQuesObj.getStudentResponse());
			
			// Check to see if this was the last question
			this.completed = this.checkCompletion();
			if(this.isPostAssessment) {
				this.btnContinue.value = unescape(Lang.UI_LABEL_CONTINUE);
			}
			if(this.feedbackEnabled) // If immediate feedback is enabled, display the feedback
			{
				this.renderQuestionFeedback();
				var self = this;
				if(!this.completed)
				{
					if(Utils.browserDetection.isMobile())
					{
						this.btnContinue.ontouchend = function(e)
						{
							setTimeout(function(){self.next();},0);
						};
					}
					else
					{
						this.btnContinue.onclick = function(){self.next();};
					}
				}
				else
				{
					if(Utils.browserDetection.isMobile())
					{
						this.btnContinue.ontouchend = function(e)
						{
							setTimeout(function(){self.endAssessment();},0);
						};
					}
					else
					{
						this.btnContinue.onclick = function(){self.endAssessment();};
					}
				}
			}
			else // Otherwise move directly to the next question
			{
				if(!this.completed)
				{
					this.next();
				}
				else
				{
					this.endAssessment();
				}
			}
		}
		else
		{
			alert(unescape(Lang.ASSESSMENT_ANSWER_QUES_PROMPT));
			return false;
		}
	};
	
	/**
	 * Renders the next question
	 * @method next
	 */
	this.next = function()
	{
		var self = this;
		if(Utils.browserDetection.isMobile())
		{
			this.btnContinue.ontouchend = function(e)
			{
				setTimeout(function(){self.check();},0);
			};
		}
		else
		{
			this.btnContinue.onclick = function()
			{
				self.check();
			};
		}
		this.currentQues++;
		this.currentQuesObj = this.questionList[this.currentQues];
		this.loadQuestionAudio();
		this.render();
	};

	/**
	 * Checks for presence of audio within the current question and loads it
	 * @method loadQuestionAudio
	 */
	this.loadQuestionAudio = function()
	{
		engine.controller.audioReset();

		if(this.currentQuesObj.audio)
		{
			engine.controller.loadAudio(this.currentQuesObj.audio);
		}
		else
		{
			engine.controller.audioStop();
			engine.controller.disableAudio();
		}
	};
	
	/**
	 * Resets the current question and allows learner to retry
	 * @method retry
	 */
	this.retry = function()
	{
		var self = this;
		if(Utils.browserDetection.isMobile())
		{
			this.btnContinue.ontouchend = function(e)
			{
				setTimeout(function(){self.check();},0);
			};
		}
		else
		{
			this.btnContinue.onclick = function()
			{
				self.check();
			};
		}
		this.currentQuesObj.reset();
		this.render();
		if(this.currentQuesObj.quesType == "Sim") 
		{
			Utils.dom.setStyleById('assessmentButtons', 'display', 'none', '', this.contentDoc);
		}
	};
	
	/**
	 * Automatically calls the check method - for use by simulation interactions
	 * in an assessment scenario
	 * @method retry
	 */
	this.autoAdvance = function()
	{
		if(this.isInteraction)
		{
			if(this.currentQuesObj.quesType == "Sim")
			{
				if(this.currentSimMode == 3)
				{
					this.check();
				}
				else
				{
					this.resetFeedback();
				}
			}
			else
			{
				this.check();
			}
		}
		else
		{
			Utils.dom.setStyleById('assessmentButtons', 'display', 'block', '', this.contentDoc);
			this.check();
		}
	};
	
	/**
	 * Calls resetInteraction against the DnD question object
	 * @method resetInteraction
	 */
	this.resetInteraction = function()
	{
		// The reset button must have been clicked, so disable it until something else re-enables it.
		this.btnReset.disabled = true;
		this.btnShowMe.disabled = false;
		this.btnContinue.disabled = false;

		this.render();
	};
	
	/**
	 * Calls showMe against the DnD question object
	 * @method showMe
	 */
	this.showMe = function()
	{
		// The show me button has been clicked, so we should be able to reset.
		this.btnReset.disabled = false;
		this.btnShowMe.disabled = true;
		this.btnContinue.disabled = true;
		this.currentQuesObj.showMe();
	};

	/**
	 * Calls skip simulation
	 * @method skipSim
	 */
	this.skipSim = function()
	{
		this.currentQuesObj.answered = true;
		this.currentQuesObj.correct = false;
		this.currentQuesObj.skipped = true;
		this.check();
	};

	/**
	 * Enables the Reset button after action is performed within interaction - used by DnD interactions
	 * @method enableReset
	 */
	this.enableReset = function()
	{
		this.btnReset.disabled = false;
	};

	this.enableContinue = function()
	{
		this.btnContinue.disabled = false;
	};
	
	/**
	 * Sets the correct response on the current question object - used by DnD interactions
	 * @method setCorrectResponse
	 */
	this.setCorrectResponse = function(correctResponse)
	{
		this.currentQuesObj.setCorrectResponse(correctResponse);
	};
	
	/**
	 * Sets the student's response on the current question object - used by DnD interactions
	 * @method setStudentResponse
	 */
	this.setStudentResponse = function(studentResponse)
	{
		// A response has been received from the Flash interaction, enable the reset button
		this.btnReset.disabled = false;
		this.currentQuesObj.setStudentResponse(studentResponse);
	};
	
	/**
	 * Fires when question has been answered - used by DnD interactions
	 * @method onInteractionComplete
	 */
	this.onInteractionComplete = function(result)
	{
		if (result === true) 
		{
			this.setInteractionCorrect();
		}
		else if (result === false) 
		{
			this.setInteractionIncorrect();
		}
		this.setInteractionComplete();
		engine.controller.onInteractionComplete(result);
	};
	
	/**
	 * Sets the current question object to correct - used by DnD interactions
	 * @method setInteractionCorrect
	 */
	this.setInteractionCorrect = function()
	{
		this.currentQuesObj.correct = true;
	};
	
	/**
	 * Sets the current question object to incorrect - used by DnD interactions
	 * @method setInteractionIncorrect
	 */
	this.setInteractionIncorrect = function()
	{
		this.currentQuesObj.correct = false;
	};

	/**
	 * Sets the current simulation "mode" (0,1,2,3) to restrict display of feedback
	 * @method setCurrentSimMode
	 */
	this.setCurrentSimMode = function(mode)
	{
		this.currentSimMode = mode;
		Utils.dom.setStyleById('assessmentButtons', 'display', 'none', '', this.contentDoc);
	};
}
