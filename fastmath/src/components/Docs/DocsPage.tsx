import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiBookOpen, FiArrowLeft } from 'react-icons/fi';

export function DocsPage() {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Back button */}
      <button 
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center text-blue-600 hover:text-blue-800 transition-colors"
      >
        <FiArrowLeft className="mr-2" />
        <span className="font-medium">Back to Home</span>
      </button>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <FiBookOpen className="text-yellow-400" size={40} />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
              FastMath Docs
            </h1>
          </motion.div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            A comprehensive guide to understanding how FastMath app helps students build math fact fluency
          </p>
        </div>

        {/* Main content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-8 rounded-xl shadow-md space-y-8"
        >
          <section>
            <h2 className="text-2xl font-bold text-blue-600 mb-4">Overview</h2>
            <p className="text-gray-700">
              FastMath is an app designed to help students build math fact fluency, similar to RocketMath. 
              The app uses adaptive learning techniques to personalize practice and ensure students master basic math operations at their own pace.
            </p>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-blue-600 mb-4">How FastMath Works</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">1. Daily Learning Flow</h3>
                <p className="text-gray-700 mb-2">
                  From the Dashboard, students can see their progress and begin their daily practice session with a single click:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>The dashboard displays a visual progress grid showing mastery levels for each fact</li>
                  <li>Color-coded cells indicate progress: grey (not started), blue (learning), orange (accuracy practice), yellow (fluency 6s), lime (fluency 3s-1.5s), and green (mastered)</li>
                  <li>The dashboard provides a clear percentage of track completion</li>
                  <li>Students simply click the "Start" button to begin their personalized learning session</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">2. Learning Path</h3>
                <p className="text-gray-700 mb-2">
                  FastMath uses a structured learning flow that moves students through distinct stages:
                </p>
                
                <div className="ml-4 mt-4 space-y-4">
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">a. Learn Stage</h4>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Students are introduced to 1-3 new facts at a time</li>
                      <li>Each fact is presented clearly with its answer</li>
                      <li>Students practice recalling the answer to build initial memory</li>
                      <li>The app tracks correct responses and ensures correct retrieval before moving to the next fact</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">b. Practice Stage</h4>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Students practice the facts they've just learned in a mixed sequence</li>
                      <li>Each fact must be answered correctly multiple times to progress</li>
                      <li>Facts require increasingly faster response times</li>
                      <li>Color-coded indicators show mastery progress for each fact</li>
                      <li>Facts that are not mastered are recycled for additional practice</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">c. Timed Practice Stage</h4>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Students practice facts with a timer</li>
                      <li>The app adjusts timing requirements based on student progress</li>
                      <li>Students must answer correctly within the specified time window</li>
                      <li>This stage builds both accuracy and speed (fluency)</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">3. Accuracy Practice</h3>
                <p className="text-gray-700 mb-2">
                  Accuracy Practice focuses on building precision in math fact recall:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>Students practice facts where they've made errors</li>
                  <li>The practice adapts to focus more on challenging facts</li>
                  <li>There's no time pressure, allowing students to focus on getting correct answers</li>
                  <li>The app tracks accuracy rates and adjusts the learning path accordingly</li>
                  <li>FastMath requires consistent accuracy across 3 separate practice days before advancing a fact, ensuring true mastery</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">4. Fluency Practice</h3>
                <p className="text-gray-700 mb-2">
                  Fluency Practice builds speed while maintaining accuracy:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>Students practice facts with progressively stricter time requirements</li>
                  <li>The app starts with longer response windows (6 seconds) and gradually decreases time (down to 2/1.5 seconds depending on student's grade)</li>
                  <li>Facts are grouped by fluency level (6s, 3s, 2s, 1.5s)</li>
                  <li>Students must demonstrate mastery at each level before progressing</li>
                  <li>The app automatically adjusts difficulty based on grade-appropriate fluency targets</li>
                  <li>Each fluency level provides the perfect challenge that's achievable but stretches the student's abilities</li>
                </ul>

                <div className="ml-4 mt-6 space-y-4">
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Progress Bar and Mastery Tracking</h4>
                    <p className="text-gray-700 mb-2">
                      During fluency practice, FastMath uses a sophisticated progress tracking system:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>The progress bar shows how much of the current practice session you've completed</li>
                      <li>Each math fact requires a different number of correct answers to be considered "mastered"</li>
                      <li>Facts you're specifically practicing need 3 correct answers, while supporting facts only need 1</li>
                      <li>Timing matters - answers must be given within the green zone of the timer to count as fully correct</li>
                      <li>Incorrect answers or timeouts reduce your progress toward mastery of that fact</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Why Your Progress Bar Might Not Move</h4>
                    <p className="text-gray-700 mb-2">
                      If you notice your progress bar isn't advancing as expected, here's why:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li><strong>Yellow Zone Answers:</strong> Correct answers given in the yellow zone of the timer don't count toward mastery</li>
                      <li><strong>Incorrect Answers:</strong> Wrong answers reduce your progress by 2 points for that specific fact</li>
                      <li><strong>Timer Timeouts:</strong> If the timer runs out completely, it counts as an incorrect answer</li>
                      <li><strong>Different Fact Values:</strong> Some facts contribute more to the progress bar than others</li>
                      <li><strong>Repeated Facts:</strong> The system prioritizes facts you haven't mastered yet, so you might see the same fact multiple times</li>
                      <li><strong>Negative Scores:</strong> If you have more than 1 wrong answer for every 3 correct ones, your total score could be negative, preventing the progress bar from moving</li>
                    </ul>
                    <p className="text-gray-700 mt-2">
                      Since each wrong answer costs 2 points, and correct answers only give 1 point, you need to answer correctly much more often than incorrectly to make progress. If your total score drops below zero, the progress bar won't advance until you build back up to a positive score.
                    </p>
                    <p className="text-gray-700 mt-2">
                      The progress bar only advances when you truly demonstrate mastery by consistently answering quickly and correctly. This ensures you're building real fluency, not just memorizing answers temporarily.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">How the System Determines What to Show Next</h4>
                    <p className="text-gray-700 mb-2">
                      FastMath intelligently selects which facts to show you next:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Facts you haven't mastered yet are prioritized over facts you've already mastered</li>
                      <li>The system avoids showing the same fact repeatedly in succession to prevent simple memorization</li>
                      <li>When all facts are mastered, the practice session automatically completes</li>
                      <li>If you're struggling with a fact, the system will continue to present it until you demonstrate mastery</li>
                      <li>The practice session adapts to your performance in real-time</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Strategies for Faster Progress</h4>
                    <p className="text-gray-700 mb-2">
                      To see the progress bar move more quickly:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Focus on answering within the green zone of the timer</li>
                      <li>Practice consistent accuracy - a single wrong answer can undo multiple correct answers</li>
                      <li>If you're unsure of an answer, take your time within the green zone rather than guessing</li>
                      <li>Pay attention to facts you see repeatedly - these are the ones you need to master</li>
                      <li>Complete each practice session fully to build long-term retention</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">5. Progress Assessment (CQPM)</h3>
                <p className="text-gray-700 mb-2">
                  FastMath tracks student progress through Correct Questions Per Minute (CQPM) assessments:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>CQPM measures how many math facts a student can correctly answer in one minute</li>
                  <li>Regular assessments monitor progress toward grade-level fluency targets</li>
                  <li>The dashboard displays CQPM progress visually</li>
                  <li>Teachers can see class-wide data on CQPM growth</li>
                  <li>The app sets appropriate CQPM targets based on student grade level</li>
                </ul>

                <div className="ml-4 mt-6 space-y-4">
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">How Progress Assessments Work</h4>
                    <p className="text-gray-700 mb-2">
                      Progress assessments use an intelligent system to accurately measure math fact fluency:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-2">
                      <li>Assessments typically last 2 minutes, giving students enough time to demonstrate their fluency</li>
                      <li>The system prioritizes harder facts first and then shows the easier facts</li>
                      <li>Questions are intelligently shuffled to provide a balanced assessment experience</li>
                      <li>The system tracks accuracy rate (percentage of correct answers) alongside speed</li>
                      <li>FastMath uses advanced timing calculations that account for typing speed and transition time between questions</li>
                      <li>If a student answers a question incorrectly during an assessment, the system may adjust their learning path for that fact, moving it to a more appropriate practice level</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">CQPM Calculation</h4>
                    <p className="text-gray-700 mb-2">
                      FastMath uses a sophisticated method to calculate accurate CQPM (Correct Questions Per Minute):
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>The system counts the total number of correct answers during the assessment period</li>
                      <li>FastMath accounts for typing time by measuring how long students spend typing each answer</li>
                      <li>Transition time between questions is measured and factored into calculations</li>
                      <li>The final CQPM score represents true math fact fluency by removing typing and transition delays</li>
                      <li>Students with a CQPM of 40 or higher are considered "fluent" in that operation</li>
                      <li>Assessment results are automatically shared with teachers through learning management systems</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Progress Tracking</h4>
                    <p className="text-gray-700 mb-2">
                      FastMath provides comprehensive progress tracking for students and teachers:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Students can see their CQPM growth over time through regular assessments</li>
                      <li>The system tracks assessment history, allowing students and teachers to monitor improvement</li>
                      <li>Teachers receive detailed reports showing both accuracy and speed metrics</li>
                      <li>Assessment results include metadata about student performance, including fluency status</li>
                      <li>Progress assessments for different operations (addition, subtraction, multiplication, division) are tracked separately</li>
                      <li>Assessment data helps teachers identify students who may need additional support</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">6. Retention Testing</h3>
                <p className="text-gray-700 mb-2">
                  FastMath ensures long-term retention with a scientifically-designed spaced repetition system:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>After a student masters a fact, it's automatically scheduled for future retention checks</li>
                  <li>Facts are tested again at carefully spaced intervals</li>
                  <li>This proven spaced repetition schedule dramatically increases long-term memory</li>
                  <li>If a student doesn't recall a fact during retention testing, it's returned to the appropriate practice level</li>
                  <li>Students who demonstrate retention across all intervals achieve "automatic" status, indicating true mastery</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">7. Time-to-Completion Estimation</h3>
                <p className="text-gray-700 mb-2">
                  FastMath provides motivating progress feedback:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>Students see personalized estimates of how long it will take to complete their learning track</li>
                  <li>The dashboard clearly shows overall completion percentage</li>
                  <li>Progress is calculated based on each student's actual learning pace</li>
                  <li>Estimates adjust in real-time as students improve their fluency</li>
                  <li>This feature helps students set achievable goals and celebrate their progress</li>
                </ul>
              </div>

              <div>
                <h4 className="text-lg font-medium text-blue-400 mb-1">How Time Estimation Works</h4>
                <p className="text-gray-700 mb-2">
                  FastMath uses a sophisticated algorithm to calculate personalized time estimates:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>For new users, the system uses grade-appropriate default time parameters for each learning stage</li>
                  <li>For existing users (who've completed at least 10% of facts), the system analyzes their actual learning data</li>
                  <li>The algorithm tracks average time spent in each learning stage (learning, accuracy practice, and all fluency levels)</li>
                  <li>Time estimates are calculated based on the remaining facts in each stage of the learning process</li>
                  <li>The system accounts for your current progress - facts already mastered aren't included in the remaining time</li>
                  <li>For elementary students (grades 1-3), the algorithm adds extra time to account for higher error rates</li>
                  <li>As users practice more, their time estimates become increasingly accurate and personalized</li>
                </ul>
                <p className="text-gray-700 mt-2">
                  This dynamic time estimation provides realistic goals and helps students stay motivated by seeing their estimated completion time decrease as they practice consistently.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-500 mb-2">8. Daily Goals System</h3>
                <p className="text-gray-700 mb-2">
                  FastMath uses a personalized daily goals system to keep students motivated and engaged:
                </p>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li>Students are presented with adaptive daily goals based on their current progress</li>
                  <li>Goals are intelligently generated to focus on what each student needs to work on most</li>
                  <li>The system automatically creates a personalized learning path for every practice session</li>
                  <li>Completing all daily goals earns a "star session" with a celebration animation</li>
                  <li>Daily goals progress is tracked to help build consistent learning habits</li>
                </ul>

                <div className="ml-4 mt-6 space-y-4">
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Types of Daily Goals</h4>
                    <p className="text-gray-700 mb-2">
                      FastMath creates up to four different types of personalized goals:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li><strong>Learning Goals:</strong> Focus on mastering new math facts (up to 4 facts per day)</li>
                      <li><strong>Accuracy Goals:</strong> Practice facts where precision is needed before moving to fluency</li>
                      <li><strong>Fluency Goals:</strong> Build speed with facts where accuracy is already established (up to 8 facts per day)</li>
                      <li><strong>Assessment Goals:</strong> Take a progress assessment to measure CQPM improvement</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">How Goals Are Created</h4>
                    <p className="text-gray-700 mb-2">
                      The system automatically generates new goals each day based on your current progress:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li><strong>First-Time Users:</strong> New students start with learning goals for new facts, followed by practice goals as they progress</li>
                      <li><strong>Returning Users:</strong> The system analyzes your current fact statuses and creates goals for facts that need attention</li>
                      <li><strong>Learning Goals:</strong> Created when you have facts in "learning" status that need to be mastered</li>
                      <li><strong>Accuracy Goals:</strong> Generated for facts in "accuracyPractice" status that need consistent correct answers</li>
                      <li><strong>Fluency Goals:</strong> Created for facts in any fluency practice level (6s, 3s, 2s, 1.5s) that need speed improvement</li>
                      <li><strong>Progress Assessment Goals:</strong> Added periodically to measure your overall progress through CQPM assessments</li>
                      <li><strong>Goal Limits:</strong> Learning goals are capped at 4 facts, fluency goals at 8 facts, and progress assessments at 1-3 depending on your needs</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">When Goals Reset</h4>
                    <p className="text-gray-700 mb-2">
                      Daily goals follow your local timezone for a natural daily cycle:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li><strong>Local Midnight Reset:</strong> Goals reset at midnight in your local timezone, not UTC time</li>
                      <li><strong>Automatic Detection:</strong> The app detects your timezone automatically using your device settings</li>
                      <li><strong>Reset Warning:</strong> A 10-minute warning appears before midnight (23:50-23:59) to help you complete goals</li>
                      <li><strong>Travel Support:</strong> If you travel to a different timezone, goals automatically adjust to your new location</li>
                      <li><strong>New Day Goals:</strong> Each day at midnight, the system creates fresh goals based on your current progress</li>
                      <li><strong>Uncompleted Goals:</strong> Goals that weren't completed by midnight are replaced with new goals for the new day</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Intelligent Goal Generation</h4>
                    <p className="text-gray-700 mb-2">
                      The system uses a sophisticated algorithm to determine which goals to show:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Daily goals are created based on analyzing each student's current progress data</li>
                      <li>The system identifies which facts are in learning, accuracy practice, and fluency practice status</li>
                      <li>Goals adapt as students make progress - when all facts in one category are mastered, that goal type no longer appears</li>
                      <li>Progress assessment goals appear periodically to measure overall progress</li>
                      <li>Goal difficulty is calibrated to be challenging but achievable in a single session</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-medium text-blue-400 mb-1">Motivation and Streaks</h4>
                    <p className="text-gray-700 mb-2">
                      The daily goals system builds motivation through several key features:
                    </p>
                    <ul className="list-disc ml-6 text-gray-700 space-y-1">
                      <li>Progress indicators show completion status for each goal visually</li>
                      <li>Goal completion is tracked over time to build learning streaks</li>
                      <li>Completing all daily goals triggers a celebration with animated visual rewards</li>
                      <li>The system records an 8-day history of goal completion to encourage consistent practice</li>
                      <li>Each goal type's progress is automatically updated as students practice</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-blue-600 mb-4">Benefits for Students</h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <li className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold text-blue-700 mb-1">Personalized Learning</div>
                <div className="text-gray-600 text-sm">Each student works on the specific facts they need to learn</div>
              </li>
              <li className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold text-blue-700 mb-1">Adaptive Difficulty</div>
                <div className="text-gray-600 text-sm">The app automatically adjusts to each student's pace and ability</div>
              </li>
              <li className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold text-blue-700 mb-1">Clear Progress Tracking</div>
                <div className="text-gray-600 text-sm">Visual indicators show exactly what students have mastered</div>
              </li>
              <li className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold text-blue-700 mb-1">Fluency Building</div>
                <div className="text-gray-600 text-sm">Structured approach moves from accuracy to speed</div>
              </li>
              <li className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold text-blue-700 mb-1">Grade-Appropriate Goals</div>
                <div className="text-gray-600 text-sm">Targets are set based on grade-level expectations</div>
              </li>
              <li className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold text-blue-700 mb-1">Immediate Feedback</div>
                <div className="text-gray-600 text-sm">Students see their progress in real-time</div>
              </li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-blue-600 mb-4">Comparing to RocketMath</h2>
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-6 rounded-lg text-white">
              <h3 className="text-lg font-semibold mb-3">For students who already know some math facts:</h3>
              <ul className="list-disc ml-6 space-y-2">
                <li>FastMath helps students become fluent <strong>twice as fast</strong> as RocketMath by accurately measuring which facts they've already mastered</li>
                <li>No time wasted practicing facts students already know</li>
                <li>Identifies exact recall speed for each fact and creates personalized practice sessions</li>
                <li>Targeted practice increases fluency efficiently</li>
                <li>Unlike RocketMath, which inefficiently places kids in learning tracks and requires repeating previously mastered facts</li>
              </ul>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">For students just starting to learn math facts:</h3>
              <ul className="list-disc ml-6 space-y-2">
                <li>FastMath provides a positive, confidence-building experience, progressing faster than RocketMath</li>
                <li>Starts at the right level for each child, building confidence instead of frustration</li>
                <li>Gradually increases difficulty at the perfect pace—challenging but achievable</li>
                <li>Avoids the "struggle sessions" that frustrate kids in RocketMath before they're ready</li>
              </ul>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}

export default DocsPage; 