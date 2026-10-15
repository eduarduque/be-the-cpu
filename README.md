# Be the CPU

A game for learning to follow code. **Paste any C++ program** and step through it right on top of your code:
- a CPU marker shows the line about to run
- variables appear next to the lines that create them
- every function call gets its own clipboard (stack frame), with a 🚩 marking where it will return
- pointers point into a visible heap
- a plain-English note explains what each line just did

Features:
- **🎮 Predict mode:** before each jump (function calls, returns, loops, if/else), tap the line you think runs next. You also tap where arguments land and pick what gets printed. Watching code run teaches surprisingly little; predicting it is what builds the mental model.
- **👀 Watch mode:** step forward and back like a debugger, or press Auto.
- **💥 Crashes explained:** null pointers, out-of-range indexes, private access, use-after-delete, uninitialized variables and infinite loops stop on the exact line, with an explanation.
- **🔗 Share:** every traced program gets a link.

Under the hood, `cpp.js` is a small C++ interpreter written for teaching. It runs a beginner subset of C++ and records a full snapshot of the machine before every line:
- classes and structs, constructors and initializer lists, methods defined outside the class
- references, pointers, `new`/`delete`
- `vector`, `string`
- loops, `switch`, recursion
- `cin`/`cout`

Code outside that subset gets a clear "not supported yet" message instead of a wrong answer.

## Guided levels

| # | Level | Concept |
|---|-------|---------|
| 1 | Boxes | Variables hold values, not formulas |
| 2 | Workers | Functions, stack frames, pass by value |
| 3 | Links | References (`int&`) |
| 4 | Blueprints | Classes, constructors, `this`, `private`, `const` methods |
| 5 | Clones | Recursion and the call stack |

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

Deep links: `index.html#code=...` opens a shared program (use the Share button), `index.html#4` opens level 4, `index.html#4@8` jumps to step 8 of it.

## Adding a level

Levels live in `levels.js`. Each one is a program (`code`), the function `regions` in it, and a list of `steps`. Each step says what the player must do (`ask`), what changes in the machine (`do`), and a plain-English explanation (`say`). The format is documented at the top of that file. No animation code is needed; the engine in `game.js` renders everything from the state.
