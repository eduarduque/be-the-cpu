// Each level is a real program plus a hand-written trace of how the CPU runs it.
//
// step = {
//   ask:    what the player must do before the step happens
//           { type: 'line', line }                       tap the line that runs next
//           { type: 'tok', ans: [{ line, t, occ? }] }    tap a word in the code
//           { type: 'choice', options, answer, whys? }   pick an answer
//   prompt: question shown in the bubble (line asks default to "Which line runs next?")
//   carry:  value the player is holding (shown as a parcel)
//   hint:   shown after a wrong answer
//   do:     state changes once answered (see apply() in game.js)
//   fly:    parcel animation { from, to } — { tok: [line, text, occ] } | { var } | { field } | { temp } | { out }
//   say:    plain-English explanation shown after the step
// }

const line = (n, say, extra = {}) => ({ ask: { type: 'line', line: n }, do: [['goto', n]], say, ...extra });

window.LEVELS = [
  {
    id: 'boxes',
    title: 'Boxes',
    concept: 'Variables hold values, not formulas',
    intro: 'You are the CPU. You run one line at a time and keep track of every variable. Let\'s start simple.',
    code: `#include <iostream>
using namespace std;

int main() {
    int apples = 3;
    int pears = apples + 2;
    apples = 10;
    cout << pears << endl;
    return 0;
}`,
    regions: [{ fn: 'main', start: 4, end: 10 }],
    steps: [
      line(4, 'Every C++ program starts in <code>main()</code>. You get a 📋 <b>clipboard</b> for main\'s variables. Programmers call it a <em>stack frame</em>.', {
        prompt: 'Every C++ program starts at the same function. Tap the line where this program starts running.',
        hint: 'Look for <code>main()</code>.',
        do: [['push', 'main', null], ['goto', 4]],
      }),
      line(5, 'Inside a function, lines run top to bottom, one at a time.'),
      {
        ask: { type: 'tok', ans: [{ line: 5, t: 'apples' }] }, carry: '3',
        prompt: 'You\'re holding 📦 <b>3</b>. Tap the variable it goes into.',
        hint: 'The variable being filled is on the left of the <code>=</code>.',
        fly: { from: { tok: [5, '3'] }, to: { var: 'apples' } },
        do: [['set', 'apples', '3', 5]],
        say: '<code>apples</code> is now a box on main\'s clipboard holding 3.',
      },
      line(6, 'Next line.'),
      {
        ask: { type: 'choice', options: ['5', 'apples2', '3'], answer: 0, whys: [, 'The <code>+</code> adds numbers. It doesn\'t glue names together.', 'Don\'t forget the <code>+ 2</code>.'] },
        prompt: 'To fill <code>pears</code>, you compute <code>apples + 2</code>. What value do you get?',
        fly: { from: { var: 'apples' }, to: { var: 'pears' } },
        do: [['set', 'pears', '5', 6]],
        say: 'You looked inside <code>apples</code> (3), added 2, and put <b>5</b> in <code>pears</code>.',
      },
      line(7, 'This line doesn\'t create a variable (no <code>int</code>). It changes one that already exists.'),
      {
        ask: { type: 'tok', ans: [{ line: 7, t: 'apples' }, { line: 5, t: 'apples' }] }, carry: '10',
        prompt: 'You\'re holding 📦 <b>10</b>. Tap where it goes.',
        fly: { from: { tok: [7, '10'] }, to: { var: 'apples' } },
        do: [['set', 'apples', '10', 5]],
        say: 'The old 3 is thrown away. A box holds one value at a time.',
      },
      {
        ask: { type: 'choice', options: ['5', '12', '10'], answer: 0, whys: [, '<code>pears</code> doesn\'t remember the formula <code>apples + 2</code>, only the result.', 'Changing <code>apples</code> never touches <code>pears</code>.'] },
        prompt: 'Quick check: <code>apples</code> is now 10. What is in <code>pears</code>?',
        do: [],
        say: '<code>pears</code> got a <b>copy of the result</b> (5) back on line 6. Boxes hold values, not formulas. This trips up almost every beginner.',
      },
      line(8, 'Time to print.'),
      {
        ask: { type: 'choice', options: ['5', '12', 'pears'], answer: 0, whys: [, '<code>pears</code> is still 5.', '<code>cout</code> prints the value inside the box, not its name. Only text in "quotes" prints as-is.'] },
        prompt: '<code>cout</code> prints to the screen. What shows up?',
        fly: { from: { var: 'pears' }, to: { out: true } },
        do: [['print', '5']],
        say: '🖥 The screen shows 5.',
      },
      line(9, '<code>return 0;</code> tells the operating system "finished, no errors".'),
      {
        ask: { type: 'choice', options: ['It\'s shredded: apples and pears no longer exist', 'It\'s saved for the next run', 'The variables move to the screen'], answer: 0 },
        prompt: '<code>main</code> is finished. What happens to its 📋 clipboard?',
        do: [['pop']],
        say: 'When a function ends, its clipboard (stack frame) is destroyed, along with every variable on it.',
      },
    ],
    takeaways: [
      'Programs start at <code>main()</code>, then run top to bottom.',
      'A variable holds one value. Assigning replaces it.',
      '<code>pears = apples + 2</code> stores a result, not a formula.',
      'When a function ends, its variables are destroyed.',
    ],
  },

  {
    id: 'workers',
    title: 'Workers',
    concept: 'Functions get copies of their arguments',
    intro: 'Functions are like workers you hire: they get their own clipboard, do a job, and hand back a result. Watch where the values go.',
    code: `#include <iostream>
using namespace std;

int doubleIt(int x) {
    x = x * 2;
    return x;
}

int main() {
    int n = 4;
    int result = doubleIt(n);
    cout << n << " " << result << endl;
    return 0;
}`,
    regions: [{ fn: 'doubleIt', start: 4, end: 7 }, { fn: 'main', start: 9, end: 14 }],
    steps: [
      line(9, 'Not line 4! A function only runs when someone <b>calls</b> it. The program always starts at <code>main()</code>.', {
        prompt: 'Tap the line where this program starts.',
        hint: 'Functions don\'t run just because they come first in the file. Look for <code>main</code>.',
        do: [['push', 'main', null], ['goto', 9]],
      }),
      line(10, ''),
      {
        ask: { type: 'tok', ans: [{ line: 10, t: 'n' }] }, carry: '4',
        prompt: 'You\'re holding 📦 <b>4</b>. Tap where it goes.',
        fly: { from: { tok: [10, '4'] }, to: { var: 'n' } },
        do: [['set', 'n', '4', 10]],
        say: '<code>n</code> = 4 on main\'s clipboard.',
      },
      line(11, 'To fill <code>result</code>, you first need the value of <code>doubleIt(n)</code>.'),
      line(4, 'You jump to <code>doubleIt</code>. A 🚩 stays on line 11 so you know where to come back. doubleIt gets a <b>fresh 📋 clipboard</b> on top of main\'s. That pile of clipboards is the <em>call stack</em>.', {
        prompt: 'The right side calls <code>doubleIt(n)</code>. Which line runs next?',
        hint: 'Calling a function jumps to where that function is defined.',
        do: [['push', 'doubleIt', 11], ['goto', 4]],
      }),
      {
        ask: { type: 'tok', ans: [{ line: 4, t: 'x' }] }, carry: '4',
        prompt: 'You carry a copy of <code>n</code> (📦 <b>4</b>) into doubleIt. Tap where it lands.',
        hint: 'It goes into the function\'s parameter, inside the <code>( )</code>.',
        fly: { from: { var: 'n' }, to: { var: 'x' } },
        do: [['set', 'x', '4', 4]],
        say: '<code>x</code> is doubleIt\'s own variable, holding a <b>copy</b> of n. Notice main\'s <code>n</code> is dimmed: it still exists, but doubleIt can\'t see it.',
      },
      line(5, ''),
      {
        ask: { type: 'choice', options: ['8', '4', '16'], answer: 0, whys: [, 'x gets replaced by <code>x * 2</code>.', 'x was 4, and 4 × 2 is 8.'] },
        prompt: '<code>x = x * 2;</code> What is x now?',
        fly: { from: { tok: [5, 'x', 2] }, to: { var: 'x' } },
        do: [['set', 'x', '8', 4]],
        say: 'x is now 8.',
      },
      {
        ask: { type: 'choice', options: ['No: x is a copy, so n is still 4', 'Yes: n is 8 now'], answer: 0, whys: [, 'x got a <b>copy</b> of n. Changing the copy never changes the original.'] },
        prompt: 'Did <code>n</code> (back in main) change?',
        do: [],
        say: 'This is called <b>pass by value</b>: the function works on a photocopy.',
      },
      line(6, ''),
      line(11, 'A copy of x (📦 8) travels back to line 11. doubleIt\'s clipboard is shredded, so <code>x</code> no longer exists.', {
        prompt: '<code>return x;</code> ends the function. Which line do you go back to?',
        hint: 'Follow the 🚩.',
        fly: { from: { var: 'x' }, to: { temp: true } },
        do: [['ret', '8'], ['goto', 11]],
      }),
      {
        ask: { type: 'tok', ans: [{ line: 11, t: 'result' }] }, carry: '8',
        prompt: 'You\'re holding the returned 📦 <b>8</b>. Tap where it goes.',
        fly: { from: { temp: true }, to: { var: 'result' } },
        do: [['set', 'result', '8', 11], ['cleartemp']],
        say: '<code>result</code> = 8.',
      },
      line(12, ''),
      {
        ask: { type: 'choice', options: ['4 8', '8 8', '4 4'], answer: 0, whys: [, 'n was never changed. Only its copy x was.', 'result got the returned 8.'] },
        prompt: 'What appears on the screen?',
        do: [['print', '4 8']],
        say: '🖥 <code>4 8</code>. The original n survived.',
      },
      line(13, ''),
      {
        ask: { type: 'choice', options: ['Shredded: n and result are destroyed', 'They move into doubleIt'], answer: 0 },
        prompt: 'main ends. What happens to its clipboard?',
        do: [['pop']],
        say: 'Program finished.',
      },
    ],
    takeaways: [
      'Functions only run when called. Calling one <b>jumps</b> there.',
      'Each call gets its own 📋 clipboard (stack frame). A 🚩 marks where to return.',
      'Parameters are <b>copies</b>: changing x never changes n.',
      '<code>return</code> sends a copy back to the line that made the call.',
    ],
  },

  {
    id: 'references',
    title: 'Links',
    concept: 'References: when a function CAN change your variable',
    intro: 'Last level, the function got a copy. One tiny symbol changes everything. Find it.',
    code: `#include <iostream>
using namespace std;

void addTen(int& x) {
    x = x + 10;
}

int main() {
    int score = 5;
    addTen(score);
    cout << score << endl;
    return 0;
}`,
    regions: [{ fn: 'addTen', start: 4, end: 6 }, { fn: 'main', start: 8, end: 13 }],
    steps: [
      line(8, 'Starting in main.', { prompt: 'Tap the line where this program starts.', do: [['push', 'main', null], ['goto', 8]] }),
      line(9, ''),
      {
        ask: { type: 'tok', ans: [{ line: 9, t: 'score' }] }, carry: '5',
        prompt: 'You\'re holding 📦 <b>5</b>. Tap where it goes.',
        fly: { from: { tok: [9, '5'] }, to: { var: 'score' } },
        do: [['set', 'score', '5', 9]],
        say: '<code>score</code> = 5.',
      },
      line(10, ''),
      line(4, 'Jump! 🚩 on line 10, new 📋 for addTen.', {
        prompt: '<code>addTen(score)</code> is a call. Which line runs next?',
        do: [['push', 'addTen', 10], ['goto', 4]],
      }),
      {
        ask: { type: 'choice', options: ['A link to main\'s score: x is just another name for it', 'A copy of 5, like doubleIt got', 'Nothing until line 5'], answer: 0, whys: [, 'That would be <code>int x</code>. Look again: <code>int&amp; x</code>.', 'Parameters are filled the moment the function is called.'] },
        prompt: 'Look closely: <code>int&amp; x</code>. That <b>&amp;</b> makes x a <em>reference</em>. What does x get?',
        fly: { from: { var: 'score' }, to: { var: 'x' } },
        do: [['set', 'x', { ref: 'score' }, 4]],
        say: 'x holds no number of its own. It\'s a 📎 <b>link</b> to score: anything done to x happens to score.',
      },
      line(5, ''),
      {
        ask: { type: 'choice', options: ['score, back in main', 'only x', 'neither: it makes a new box'], answer: 0, whys: [, 'x has no box of its own. It\'s a link to score.', 'Nothing new is created. x leads straight to score.'] },
        prompt: '<code>x = x + 10;</code> Which box actually changes?',
        fly: { from: { tok: [5, 'x'] }, to: { var: 'score' } },
        do: [['setin', 0, 'score', '15', 9]],
        say: 'score became 15, from inside a different function!',
      },
      line(6, 'End of addTen.'),
      line(10, 'addTen\'s clipboard is shredded and <code>x</code> is gone. But the change stays, because it was made to <code>score</code> itself.', {
        prompt: 'addTen is done. Where do you return?',
        hint: 'Follow the 🚩.',
        do: [['pop'], ['goto', 10]],
      }),
      line(11, ''),
      {
        ask: { type: 'choice', options: ['15', '5', '10'], answer: 0, whys: [, 'This time the function had a link, not a copy.', 'score started at 5, plus 10.'] },
        prompt: 'What appears on the screen?',
        fly: { from: { var: 'score' }, to: { out: true } },
        do: [['print', '15']],
        say: '🖥 15.',
      },
      line(12, ''),
      {
        ask: { type: 'choice', options: ['When the function needs to change the caller\'s variable', 'Always, just in case', 'Never: it\'s a bug'], answer: 0 },
        prompt: 'Last question: when would you write <code>&amp;</code> on a parameter?',
        do: [['pop']],
        say: 'Use <code>&amp;</code> when the function must change the original. Without it, the function works on a copy.',
      },
    ],
    takeaways: [
      '<code>int x</code> = a copy. Changes stay inside the function.',
      '<code>int&amp; x</code> = a link (reference). Changes hit the original.',
      'The function\'s clipboard is still shredded at the end, but the link\'s effects remain.',
    ],
  },

  {
    id: 'objects',
    title: 'Blueprints',
    concept: 'Classes, constructors, private fields, methods',
    intro: 'A class is a blueprint. An object is a house built from it. Follow how "Alice Smith" travels into a private safe and back out.',
    code: `#include <iostream>
#include <string>
using namespace std;

class BankAccount {
private:
    string ownerName;

public:
    BankAccount(string name) : ownerName(name) {
    }

    string getOwnerName() const {
        return ownerName;
    }
};

int main() {
    BankAccount account("Alice Smith");
    cout << "Owner: " << account.getOwnerName() << endl;
    return 0;
}`,
    regions: [
      { kind: 'class', start: 5, end: 16, label: '📐 blueprint' },
      { fn: 'BankAccount', start: 10, end: 11, label: 'constructor' },
      { fn: 'getOwnerName', start: 13, end: 15, label: 'method' },
      { fn: 'main', start: 18, end: 22 },
    ],
    steps: [
      line(18, 'Still <code>main()</code>. The class above is a 📐 <b>blueprint</b>: it describes what a BankAccount looks like, but nothing in it runs yet.', {
        prompt: 'Where does this program start? (Careful: the class comes first in the file.)',
        hint: 'A class is only a blueprint. Nothing inside it runs until main uses it.',
        do: [['push', 'main', null], ['goto', 18]],
      }),
      line(19, 'This line builds an object from the blueprint.'),
      line(10, 'Space for <code>account</code> is reserved on main\'s clipboard (🏠 still empty). The constructor gets its own 📋 with a hidden <code>this</code>: a pointer to the object being built.', {
        prompt: 'Building an object runs its <b>constructor</b>. Which line runs next?',
        hint: 'The constructor has the same name as the class.',
        do: [
          ['set', 'account', { obj: 'BankAccount', priv: ['ownerName'], fields: { ownerName: null } }, 19],
          ['push', 'BankAccount', 19],
          ['set', 'this', { ref: 'account' }, 10],
          ['goto', 10],
        ],
      }),
      {
        ask: { type: 'tok', ans: [{ line: 10, t: 'name', occ: 1 }] }, carry: '"Alice Smith"',
        prompt: 'You\'re holding 📦 <b>"Alice Smith"</b>. Tap where it lands in the constructor.',
        hint: 'It goes into the constructor\'s parameter, inside the <code>( )</code>.',
        fly: { from: { tok: [19, '"Alice Smith"'] }, to: { var: 'name' } },
        do: [['set', 'name', '"Alice Smith"', 10]],
        say: '<code>name</code> is a parameter: a local variable on the constructor\'s clipboard, holding a copy of the text.',
      },
      {
        ask: { type: 'tok', ans: [{ line: 10, t: 'ownerName' }, { line: 7, t: 'ownerName' }] }, carry: '"Alice Smith"',
        prompt: 'The initializer list <code>: ownerName(name)</code> runs next. Tap where name\'s value gets stored.',
        hint: '<code>ownerName(name)</code> means "start ownerName with the value of name".',
        fly: { from: { var: 'name' }, to: { field: 'account.ownerName' } },
        do: [['field', 'account', 'ownerName', '"Alice Smith"']],
        say: 'Copied into the object\'s private field 🔒 <code>ownerName</code>. <code>this</code> tells the constructor <i>which</i> object to fill.',
      },
      line(11, 'The constructor body is empty, so you reach the closing brace.'),
      {
        ask: { type: 'choice', options: ['Its clipboard (name, this) is shredded, but account stays alive in main', 'Everything is destroyed, including account', 'name moves into main as a new variable'], answer: 0, whys: [, '<code>account</code> lives on main\'s clipboard, and main isn\'t finished.', 'Local variables never move between functions. They\'re destroyed.'] },
        prompt: 'The constructor is finished. What happens now?',
        do: [['pop'], ['goto', 19]],
        say: 'Back at line 19 (the 🚩). <code>name</code> is gone, but the object is built and lives as long as main does.',
      },
      line(20, ''),
      line(13, 'A method call is a function call too: new 📋, 🚩 on line 20, and a <code>this</code> pointing at <code>account</code>.', {
        prompt: 'To print, cout first needs <code>account.getOwnerName()</code>. Which line runs next?',
        do: [['push', 'getOwnerName', 20], ['set', 'this', { ref: 'account' }, 13], ['goto', 13]],
      }),
      line(14, ''),
      {
        ask: { type: 'choice', options: ['It can read the object\'s fields but never change them', 'Its return value can\'t be printed', 'It can only be called once'], answer: 0 },
        prompt: 'Notice the <code>const</code> after <code>getOwnerName()</code>. What does it promise?',
        do: [],
        say: 'A <code>const</code> method is read-only: it can look into the 🔒 safe but can\'t change it.',
      },
      line(20, 'A <b>copy</b> of the text travels back to line 20 as a temporary 📦. The method\'s clipboard is shredded.', {
        prompt: '<code>return ownerName;</code> ends the method. Which line do you go back to?',
        hint: 'Follow the 🚩.',
        fly: { from: { field: 'account.ownerName' }, to: { temp: true } },
        do: [['ret', '"Alice Smith"'], ['goto', 20]],
      }),
      {
        ask: { type: 'choice', options: ['Owner: Alice Smith', 'Owner: ownerName', 'Alice Smith'], answer: 0, whys: [, 'cout prints the value, not the variable\'s name.', 'Don\'t forget <code>"Owner: "</code> is printed first.'] },
        prompt: 'What appears on the screen?',
        fly: { from: { temp: true }, to: { out: true } },
        do: [['print', 'Owner: Alice Smith'], ['cleartemp']],
        say: '🖥 Printed. The temporary 📦 is thrown away once the line finishes.',
      },
      {
        ask: { type: 'choice', options: ['Compile error: ownerName is private', 'It prints Alice Smith', 'It prints nothing'], answer: 0, whys: [, '🔒 <code>private</code> means only BankAccount\'s own methods can touch it.', 'It wouldn\'t even compile.'] },
        prompt: 'Bonus: what if main had written <code>cout &lt;&lt; account.ownerName;</code> instead?',
        do: [],
        say: '🔒 Only the class\'s own methods can reach <code>private</code> fields. That\'s why <code>getOwnerName()</code> exists. The compiler refuses before the program ever runs.',
      },
      line(21, ''),
      {
        ask: { type: 'choice', options: ['It\'s destroyed along with main\'s clipboard', 'It stays in memory forever', 'It gets printed'], answer: 0 },
        prompt: 'main ends. What happens to <code>account</code>?',
        do: [['pop']],
        say: 'An object created like this lives on main\'s clipboard (the stack) and is destroyed with it.',
      },
    ],
    takeaways: [
      'A class is a blueprint. Nothing in it runs until an object is made or a method is called.',
      'Making an object calls the <b>constructor</b>, which fills in its fields.',
      'Every method call gets a clipboard with <code>this</code>, a pointer to its object.',
      '🔒 <code>private</code> fields are reachable only through the class\'s own methods.',
    ],
  },

  {
    id: 'recursion',
    title: 'Clones',
    concept: 'Recursion: a function that calls itself',
    intro: 'A function can call itself. Each call gets its OWN clipboard, so the stack grows. Keep your eye on the 🚩 flags.',
    code: `#include <iostream>
using namespace std;

void countdown(int n) {
    if (n == 0) {
        cout << "Go!" << endl;
        return;
    }
    cout << n << endl;
    countdown(n - 1);
}

int main() {
    countdown(2);
    return 0;
}`,
    regions: [{ fn: 'countdown', start: 4, end: 11 }, { fn: 'main', start: 13, end: 16 }],
    steps: [
      line(13, 'main first, as always.', { prompt: 'Tap the line where this program starts.', do: [['push', 'main', null], ['goto', 13]] }),
      line(14, ''),
      line(4, '🚩 on line 14, new 📋 for countdown.', { do: [['push', 'countdown', 14], ['goto', 4]] }),
      {
        ask: { type: 'tok', ans: [{ line: 4, t: 'n' }] }, carry: '2',
        prompt: 'You carry 📦 <b>2</b> into countdown. Tap where it lands.',
        fly: { from: { tok: [14, '2'] }, to: { var: 'n' } },
        do: [['set', 'n', '2', 4]],
        say: 'n = 2.',
      },
      line(5, ''),
      {
        ask: { type: 'choice', options: ['No: n is 2', 'Yes'], answer: 0 },
        prompt: 'Is <code>n == 0</code>?',
        do: [],
        say: 'False, so the whole <code>{ ... }</code> block of the if gets skipped.',
      },
      line(9, '', { hint: 'The condition was false, so skip everything inside the if\'s braces.' }),
      {
        ask: { type: 'choice', options: ['2', 'n', '0'], answer: 0 },
        prompt: 'What prints?',
        fly: { from: { var: 'n' }, to: { out: true } },
        do: [['print', '2']],
        say: '🖥 2',
      },
      line(10, ''),
      line(4, 'A function calling itself is <b>recursion</b>. You get a <b>brand-new clipboard</b>. The old one (n = 2) waits underneath, with a 🚩 on line 10.', {
        prompt: 'countdown calls... countdown! Which line runs next?',
        do: [['push', 'countdown', 10], ['goto', 4]],
      }),
      {
        ask: { type: 'choice', options: ['1', '2', '0'], answer: 0, whys: [, 'That\'s the OLD clipboard\'s n. This call received <code>n - 1</code>.', 'Not yet. 2 - 1 is 1.'] },
        prompt: 'What is <code>n</code> on the NEW clipboard?',
        fly: { from: { tok: [10, 'n'] }, to: { var: 'n' } },
        do: [['set', 'n', '1', 4]],
        say: 'Two different <code>n</code>s exist at once, one per clipboard. Only the top one is visible.',
      },
      line(5, ''),
      line(9, 'n is 1, not 0, so skip the if again.', { hint: 'n is 1. Is the condition true?' }),
      {
        ask: { type: 'choice', options: ['1', '2', 'Go!'], answer: 0 },
        prompt: 'What prints?',
        fly: { from: { var: 'n' }, to: { out: true } },
        do: [['print', '1']],
        say: '🖥 1',
      },
      line(10, ''),
      line(4, 'Third clipboard. This one gets n = 1 - 1 = <b>0</b>.', {
        prompt: 'Calling itself again. Which line runs next?',
        fly: { from: { tok: [10, 'n'] }, to: { var: 'n' } },
        do: [['push', 'countdown', 10], ['set', 'n', '0', 4], ['goto', 4]],
      }),
      {
        ask: { type: 'choice', options: ['4 (3 countdowns + main)', '1', '2'], answer: 0, whys: [, 'Every call that hasn\'t returned yet still has its clipboard.', 'Count the 🚩 flags, plus the one you\'re on, plus main.'] },
        prompt: 'How many clipboards are on the call stack right now?',
        do: [],
        say: 'Three countdown clipboards wait on top of main\'s. That pile is the call stack. If it never stopped growing, you\'d get a <b>stack overflow</b>.',
      },
      line(5, ''),
      {
        ask: { type: 'choice', options: ['Yes!', 'No'], answer: 0 },
        prompt: 'Is <code>n == 0</code> now?',
        do: [],
        say: 'This is the <b>base case</b>: the stop condition every recursion needs.',
      },
      line(6, '🖥 Go!', { fly: { from: { tok: [6, '"Go!"'] }, to: { out: true } }, do: [['goto', 6], ['print', 'Go!']] }),
      line(7, '<code>return;</code> leaves this call right now.'),
      line(10, 'The n = 0 clipboard is shredded. You\'re back on the n = <b>1</b> clipboard, which was waiting the whole time.', {
        prompt: 'Where do you return to?',
        hint: 'Follow the most recent 🚩.',
        do: [['pop'], ['goto', 10]],
      }),
      line(11, 'The call on line 10 is done, so continue to the next line: the end of this call.', { hint: '<code>countdown(n - 1)</code> just finished. What comes after it?' }),
      line(10, 'Back to the n = <b>2</b> clipboard.', { prompt: 'Where do you return to?', do: [['pop'], ['goto', 10]] }),
      line(11, ''),
      line(14, 'All countdown clipboards are gone. Back in main.', { prompt: 'Where do you return to?', do: [['pop'], ['goto', 14]] }),
      line(15, ''),
      {
        ask: { type: 'choice', options: ['2, 1, Go!', 'Go!, 1, 2', '2, 2, 2'], answer: 0 },
        prompt: 'Final check: what\'s on the screen, top to bottom?',
        do: [['pop']],
        say: 'Each call printed its own n before calling the next one.',
      },
    ],
    takeaways: [
      'Each recursive call gets its own clipboard with its own <code>n</code>.',
      'Waiting calls pile up as 🚩 flags. Returns unwind them in reverse order.',
      'Every recursion needs a <b>base case</b> that stops it.',
    ],
  },
];
