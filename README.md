# Be the CPU

A visual C++ debugger for learning. **Paste any C++ program** (or pick one from the study-notes library) and watch it run one line at a time. Nothing to answer, nothing scored: it's for seeing what the computer does.

After every line you can see:
- **Code:** the line that runs next (▶), the line that just ran, and 🚩 where a function call is waiting to return
- **What changed:** values that were created, changed, increased ▲, decreased ▼, pointers that moved ➜, variables that went out of scope ✕ and heap memory that was deleted 🗑
- **Variables:** every function call on the call stack with its variables, plus the heap
- **Array boxes:** arrays drawn as numbered boxes, with index variables (`i`, `start`, `maxIndex`...) and pointers tagged on the box they point at
- **Memory map:** every variable, array slot, object field and heap block with its address
- **Explanation:** a plain-English description of what the line did, including crashes (null/dangling pointers, out-of-range indexes, uninitialized values)
- **Output:** what the program printed

Every panel can be shown or hidden with the **Show:** toggles (your choice is remembered), and addresses can be turned on or off everywhere. Step forward and back, drag the slider, or press **Auto** (slow / normal / fast). Hover a pointer to light up what it points at.

## Program library

`examples.js` holds short programs for each section of the C++ study notes (functions, arrays and structs, pointers, pointer parameters, `new`/`delete`, classes, constructors/destructors, copy constructors, separate compilation), an **Exam 1 walkthrough**, the **selection sort** debugger example, and a Linux command reference card.

## How it works

`cpp.js` is a small C++ interpreter written for teaching. It runs a beginner subset of C++ and records a full snapshot of the machine (call stack, variables, memory addresses, heap, output) before every line:
- classes and structs, constructors, destructors, copy constructors, methods defined outside the class
- references, pointers, pointer arithmetic, `new`/`delete`, `new[]`/`delete[]`
- arrays (including 2D), `vector`, `string`
- loops, `switch`, recursion, `cin`/`cout`

Code outside that subset gets a clear "not supported yet" message instead of a wrong answer. Addresses are simulated (deterministic, realistic layout: stack grows down, heap grows up, array elements are contiguous).

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

Links: `index.html#code=...` opens a shared program (use the Share button), `index.html#ex=<id>` opens a library example, and `@8` at the end jumps to step 8.

## Adding an example

Add an item to a section in `examples.js`: `{ id, title, watch, code, input }`. `watch` is a one-line hint about what to look at while it runs.
