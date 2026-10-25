// examples.js: example programs for each section of the C++ study notes.
// Each item is a short program to step through and watch; nothing here is a quiz.
window.EXAMPLES = [
  // ------------------------------------------------------------------ 1
  { section: 1, title: 'Functions', items: [
    { id: 'fn-four-pieces', title: 'The four pieces: prototype, call, definition, return',
      watch: 'main calls addNumbers before its definition, which works because of the prototype on line 4. Watch a new box (stack frame) open for each call, and the returned value land in result. displayHelloWorld is void, so nothing comes back from it.',
      code: `#include <iostream>
using namespace std;

int addNumbers(int a, int b);      // 1. PROTOTYPE: announces the function

void displayHelloWorld()           // void: does a job, returns nothing
{
    cout << "Hello world" << endl;
}

int absoluteNumber(int number)     // value-returning
{
    if (number < 0)
        number *= -1;
    return number;
}

int main()
{
    displayHelloWorld();
    int result = addNumbers(5, 3); // 2. CALL: 5 and 3 are the arguments
    cout << result << endl;        // 8
    cout << absoluteNumber(-9) << endl;   // 9
    return 0;
}

int addNumbers(int a, int b)       // 3. DEFINITION: a and b are parameters
{
    int sum = a + b;
    return sum;                    // 4. RETURN: hands sum back to main
}
`, input: '' },
    { id: 'fn-value-vs-ref', title: 'Pass by value vs. pass by reference',
      watch: 'changeByValue gets its own x box holding a copy, so main\'s number stays 5. changeByReference\'s x is just another name for number, so the 100 lands in main. In modifyValues, a is a copy and b is an alias for y.',
      code: `#include <iostream>
using namespace std;

void changeByValue(int x)          // x is a photocopy
{
    x = 100;
    cout << "Inside function: " << x << endl;
}

void changeByReference(int& x)     // x is another name for the original
{
    x = 100;
}

void modifyValues(int a, int& b)
{
    a = 20;    // changes a copy
    b = 30;    // changes y itself
}

int main()
{
    int number = 5;
    changeByValue(number);
    cout << "After by value: " << number << endl;       // 5
    changeByReference(number);
    cout << "After by reference: " << number << endl;   // 100

    int x = 10, y = 15;
    modifyValues(x, y);
    cout << "x: " << x << ", y: " << y << endl;         // x: 10, y: 30
    return 0;
}
`, input: '' },
    { id: 'fn-scope', title: 'Scope: globals, locals and name hiding',
      watch: 'The global value sits in the globals area. testHiding makes its own local value that hides the global; changeGlobal has no int, so it rewrites the global. Then an inner { } block makes a second score that disappears when the block ends.',
      code: `#include <iostream>
using namespace std;

int value = 20;                 // global

void testHiding()
{
    int value = 5;              // new local, hides the global
    cout << value << endl;      // 5
}

void changeGlobal()
{
    value = 99;                 // no int: changes the global
}

int main()
{
    cout << value << endl;      // 20
    testHiding();
    cout << value << endl;      // 20: global untouched
    changeGlobal();
    cout << value << endl;      // 99

    int score = 100;
    if (true)
    {
        int score = 50;         // a different score, inner block only
        cout << score << endl;  // 50
    }
    cout << score << endl;      // 100
    return 0;
}
`, input: '' },
    { id: 'fn-overload', title: 'Overloading: same name, different parameters',
      watch: 'Four functions are all named add. Watch which definition the arrow jumps into for each call: the compiler picks by the number and types of the arguments.',
      code: `#include <iostream>
#include <string>
using namespace std;

int add(int a, int b)           { return a + b; }       // version 1
int add(int a, int b, int c)    { return a + b + c; }   // version 2
double add(double a, double b)  { return a + b; }       // version 3
string add(string a, string b)  { return a + b; }       // version 4

int main()
{
    cout << add(5, 3) << endl;          // 8     -> version 1
    cout << add(5, 3, 2) << endl;       // 10    -> version 2
    cout << add(5.5, 3.2) << endl;      // 8.7   -> version 3
    cout << add(string("Hi "), string("there")) << endl;   // Hi there
    return 0;
}
`, input: '' },
    { id: 'fn-default-args', title: 'Default arguments',
      watch: 'The defaults live in the prototype only. Watch height and depth fill in with 1.0 and 1.5 when a call leaves them off, and take the given values when it does not.',
      code: `#include <iostream>
using namespace std;

double volume(double width, double height = 1.0, double depth = 1.5);   // prototype

int main()
{
    cout << volume(2.0) << endl;             // 2 * 1.0 * 1.5 = 3
    cout << volume(2.0, 4.0) << endl;        // 2 * 4.0 * 1.5 = 12
    cout << volume(2.0, 4.0, 3.0) << endl;   // 24
    return 0;
}

double volume(double width, double height, double depth)   // no defaults here
{
    return width * height * depth;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 2
  { section: 2, title: 'Arrays and structs', items: [
    { id: 'arr-loop-patterns', title: 'Loop patterns: count, sum, max, index of min',
      watch: 'Every pattern is a for loop over indexes 0 to SIZE - 1. Watch count, sum, maximum and minIndex change only when the if is true. maximum starts at arr[0], not 0, and minIndex keeps a position, not a value.',
      code: `#include <iostream>
using namespace std;

int main()
{
    const int SIZE = 5;
    int arr[SIZE] = {12, 8, 15, 3, 20};

    int count = 0;                       // count values > 10
    for (int i = 0; i < SIZE; i++)
        if (arr[i] > 10) count++;

    double sum = 0.0;                    // sum and average
    for (int i = 0; i < SIZE; i++)
        sum += arr[i];
    double average = sum / SIZE;

    int maximum = arr[0];                // start with the first element
    for (int i = 1; i < SIZE; i++)
        if (arr[i] > maximum) maximum = arr[i];

    int minIndex = 0;                    // track the position
    for (int i = 1; i < SIZE; i++)
        if (arr[i] < arr[minIndex]) minIndex = i;

    cout << "Count > 10: " << count << endl;
    cout << "Average: " << average << endl;
    cout << "Max: " << maximum << endl;
    cout << "Min: " << arr[minIndex] << " at index " << minIndex << endl;
    return 0;
}
`, input: '' },
    { id: 'arr-pass-to-function', title: 'Passing an array to a function',
      watch: 'modifyArray does not get a copy: its arr points at main\'s numbers. Watch main\'s boxes double while the code runs inside modifyArray. The size has to be passed separately.',
      code: `#include <iostream>
using namespace std;

void modifyArray(int arr[], int size)   // empty brackets in the parameter
{
    for (int i = 0; i < size; i++)
        arr[i] *= 2;
}

void printArray(int arr[], int size)
{
    for (int i = 0; i < size; i++)
        cout << arr[i] << " ";
    cout << endl;
}

int main()
{
    int numbers[4] = {1, 2, 3, 4};
    printArray(numbers, 4);     // 1 2 3 4
    modifyArray(numbers, 4);    // no brackets in the call
    printArray(numbers, 4);     // 2 4 6 8
    return 0;
}
`, input: '' },
    { id: 'arr-2d', title: '2D arrays: rows and columns',
      watch: 'Read matrixArr[i][j] as [row][column]. The outer loop picks a row, the inner loop walks across its columns. sumMatrix must be told the column count (3) in its parameter.',
      code: `#include <iostream>
using namespace std;

int sumMatrix(int iArr[][3], int rows)   // columns required
{
    int sum = 0;
    for (int i = 0; i < rows; i++)
        for (int j = 0; j < 3; j++)
            sum += iArr[i][j];
    return sum;
}

int main()
{
    int matrixArr[2][3] =
    {
        {1, 2, 3},   // row 0
        {4, 5, 6}    // row 1
    };
    cout << matrixArr[1][0] << endl;     // 4
    for (int i = 0; i < 2; i++)          // rows
    {
        for (int j = 0; j < 3; j++)      // columns
            cout << matrixArr[i][j] << " ";
        cout << endl;
    }
    cout << "Sum: " << sumMatrix(matrixArr, 2) << endl;   // 21
    return 0;
}
`, input: '' },
    { id: 'struct-basics', title: 'Structs: one record, many types',
      watch: 'student1 is filled one member at a time with the dot operator; student2 is filled in member order. Assigning student3 = student2 copies every member, so changing student3.gpa leaves student2 alone.',
      code: `#include <iostream>
#include <string>
using namespace std;

struct Student
{
    string name;
    int id;
    double gpa;
};   // semicolon required!

int main()
{
    Student student1;
    student1.name = "Bob Smith";          // dot operator
    student1.id = 54321;
    student1.gpa = 3.42;

    Student student2 = {"Alice Johnson", 12345, 3.85};   // in member order

    Student student3 = student2;          // copies every member
    student3.gpa = 4.0;

    cout << student1.name << " " << student1.id << " " << student1.gpa << endl;
    cout << student2.name << " " << student2.gpa << endl;   // still 3.85
    cout << student3.name << " " << student3.gpa << endl;   // 4
    return 0;
}
`, input: '' },
    { id: 'struct-array', title: 'Arrays of structs',
      watch: 'petShop is one array holding three Pet records. Watch the syntax: [index] first, then .member, as in petShop[i].name. The struct type is global; the array lives in main.',
      code: `#include <iostream>
#include <string>
using namespace std;

struct Pet                       // struct definition: global
{
    string name;
    string animalType;
    int age;
};

int main()
{
    Pet petShop[3] =             // the array: local, inside main
    {
        {"Buddy", "Dog", 3},
        {"Whiskers", "Cat", 2},
        {"Goldie", "Fish", 1}
    };
    petShop[1].age = 4;          // the second pet's age
    for (int i = 0; i < 3; i++)
        cout << "Pet " << (i + 1) << ": " << petShop[i].name
             << " (" << petShop[i].animalType << ", "
             << petShop[i].age << " years old)" << endl;
    return 0;
}
`, input: '' },
    { id: 'struct-array-param', title: 'Passing an array of structs to a function',
      watch: 'Both functions take WeatherData weather[] plus a size, so they read main\'s weekData directly (no copy). findRainiestDay tracks maxIndex, then returns that day\'s number.',
      code: `#include <iostream>
using namespace std;

struct WeatherData
{
    int day;
    double temperature;
    double rainfall;
};

double calculateAvgTemp(WeatherData weather[], int size)
{
    double sum = 0;
    for (int i = 0; i < size; i++)
        sum += weather[i].temperature;
    return sum / size;
}

int findRainiestDay(WeatherData weather[], int size)
{
    int maxIndex = 0;
    for (int i = 1; i < size; i++)
        if (weather[i].rainfall > weather[maxIndex].rainfall)
            maxIndex = i;
    return weather[maxIndex].day;
}

int main()
{
    WeatherData weekData[3] =
    {
        {1, 75.2, 0.0},
        {2, 78.5, 0.5},
        {3, 72.1, 1.2}
    };
    cout << "Average temperature: " << calculateAvgTemp(weekData, 3) << endl;  // 75.2667
    cout << "Rainiest day: " << findRainiestDay(weekData, 3) << endl;          // 3
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 3
  { section: 3, title: 'Pointers', items: [
    { id: 'ptr-basics', title: '& gets an address, * follows it',
      watch: 'p holds a\'s address (the arrow), not a copy of 5. Printing p shows a hex address; printing *p follows the arrow. *p = 10 changes a without ever naming a.',
      code: `#include <iostream>
using namespace std;

int main()
{
    int a = 5;
    int* p = &a;          // p now holds a's address
    cout << a << endl;    // 5
    cout << p << endl;    // an address like 0x7ffe...
    cout << *p << endl;   // 5 (follows p to a)
    *p = 10;              // changes a through the pointer
    cout << a << endl;    // 10

    int* q = nullptr;     // points at nothing yet
    q = p;                // copies the ADDRESS: now q points at a too
    *q = 25;
    cout << a << endl;    // 25
    return 0;
}
`, input: '' },
    { id: 'ptr-initializing', title: 'Initializing pointers (one star per pointer)',
      watch: 'In the one-line declaration, ptr1 and ptr2 each have their own *, so they are pointers; count has no *, so it is a plain int. ptr2 = values points at values[0].',
      code: `#include <iostream>
using namespace std;

int main()
{
    int number = 100;
    int values[5] = {1, 2, 3, 4, 5};
    int *ptr1 = &number, *ptr2 = values, count = 10;
    cout << *ptr1 << endl;   // 100
    cout << *ptr2 << endl;   // 1  (the array name is the address of values[0])
    cout << count << endl;   // 10

    int a = 123;
    int b = 456;
    int* p1 = &a;
    int* p2 = &b;
    cout << *p1 << " " << *p2 << endl;   // 123 456
    p1 = p2;                             // no star: copies the address
    cout << *p1 << endl;                 // 456
    return 0;
}
`, input: '' },
    { id: 'ptr-arithmetic', title: 'Pointer arithmetic and moving with ++ / --',
      watch: 'numbers + 1 means one element further, not one byte. Watch ptr\'s arrow slide right with each ++ and back with --, and sum grow by whatever ptr points at.',
      code: `#include <iostream>
using namespace std;

int main()
{
    int numbers[] = {5, 10, 15, 20, 25};
    cout << numbers[1] << " " << *(numbers + 1) << endl;   // 10 10
    cout << *numbers + 3 << endl;                           // 8: first value, plus 3

    int* ptr = numbers;   // -> 5
    ptr++;                // -> 10
    ptr++;                // -> 15
    ptr--;                // -> 10
    cout << *ptr << endl;

    int sum = 0;
    ptr = numbers;
    for (int i = 0; i < 5; i++)
    {
        sum += *ptr;      // value at the current spot
        ptr++;            // step to the next element
    }
    cout << "Sum: " << sum << endl;   // 75
    return 0;
}
`, input: '' },
    { id: 'ptr-compare-params', title: 'Comparing pointers; array parameters are pointers',
      watch: 'ptr1 < ptr2 compares where they point (index 1 comes before 3); *ptr1 > *ptr2 compares the values there (60 > 20). doubleValues takes int* arr, yet arr[i] still works and changes main\'s array.',
      code: `#include <iostream>
using namespace std;

void doubleValues(int* arr, int size)   // same as int arr[]
{
    for (int i = 0; i < size; i++)
        arr[i] = arr[i] * 2;
}

int main()
{
    int arr[5] = {50, 60, 30, 20, 40};
    int* ptr1 = &arr[1];
    int* ptr2 = &arr[3];
    cout << (ptr1 < ptr2) << endl;     // 1: addresses
    cout << (*ptr1 > *ptr2) << endl;   // 1: values (60 > 20)
    cout << (arr == &arr[0]) << endl;  // 1: the name IS the first address

    doubleValues(arr, 5);
    for (int i = 0; i < 5; i++)
        cout << arr[i] << " ";         // 100 120 60 40 80
    cout << endl;
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 4
  { section: 4, title: 'Pointers as function parameters', items: [
    { id: 'ptrparam-swap', title: 'swap with pointers',
      watch: 'The call passes &x and &y, so a and b are arrows back into main. Watch temp hold 1 while *a and *b rewrite main\'s x and y.',
      code: `#include <iostream>
using namespace std;

void swap(int* a, int* b)
{
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main()
{
    int x = 1, y = 2;
    swap(&x, &y);
    cout << "x=" << x << " y=" << y << endl;   // x=2 y=1
    return 0;
}
`, input: '' },
    { id: 'ptrparam-two-results', title: 'Returning more than one value',
      watch: 'q and r start with no value. divide writes into them through the quotient and remainder pointers, so main gets two answers from one void function.',
      code: `#include <iostream>
using namespace std;

void divide(int a, int b, int* quotient, int* remainder)
{
    *quotient  = a / b;
    *remainder = a % b;
}

int main()
{
    int a = 17, b = 5;
    int q, r;
    divide(a, b, &q, &r);
    cout << a << " / " << b << " = " << q << " remainder " << r << endl;
    return 0;
}
`, input: '' },
    { id: 'ptrparam-vs-ref', title: 'Pointer version vs. reference version',
      watch: 'Both functions add 1 to main\'s x. The pointer version needs & at the call and * inside; the reference version needs neither, because n is just another name for x.',
      code: `#include <iostream>
using namespace std;

void incrementPtr(int* ptr)     // pointer version
{
    *ptr = *ptr + 1;
}

void incrementRef(int& n)       // C++ reference version
{
    n = n + 1;
}

int main()
{
    int x = 5;
    incrementPtr(&x);           // & at the call
    cout << x << endl;          // 6
    incrementRef(x);            // no & at the call
    cout << x << endl;          // 7
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 5
  { section: 5, title: 'Dynamic memory: new and delete', items: [
    { id: 'dyn-new-delete', title: 'new rents heap memory, delete returns it',
      watch: 'Each new adds a box on the heap with no name; the pointer on the stack is the only way to reach it. After delete, the box is freed and p is set to nullptr so it is not left dangling.',
      code: `#include <iostream>
#include <string>
using namespace std;

int main()
{
    int* piNum = new int;          // value is garbage until set
    *piNum = 44;
    double* pdValue = new double(3.14159);
    string* pName = new string("John Doe");
    int* p = new int{42};

    cout << *piNum << " " << *pdValue << " " << *pName << " " << *p << endl;

    delete piNum;
    delete pdValue;
    delete pName;
    delete p;
    p = nullptr;                   // erase the stale address
    delete p;                      // deleting nullptr is safe: does nothing
    return 0;
}
`, input: '' },
    { id: 'dyn-array', title: 'A dynamic array sized at runtime',
      watch: 'The size comes from the input box, so it cannot be a fixed array. new int[size] makes the whole row on the heap, and delete[] (with brackets) frees it.',
      code: `#include <iostream>
using namespace std;

int main()
{
    int size;
    cout << "How many? ";
    cin >> size;
    int* piNumbersArr = new int[size];
    for (int i = 0; i < size; ++i)
        piNumbersArr[i] = i + 1;
    for (int i = 0; i < size; ++i)
        cout << piNumbersArr[i] << " ";
    cout << endl;
    delete[] piNumbersArr;         // [] for arrays
    piNumbersArr = nullptr;
    return 0;
}
`, input: '5' },
    { id: 'dyn-leak', title: 'A memory leak: overwriting the pointer',
      watch: 'When piNumber2 is pointed at the new 99, nothing points at the 42 any more. Watch that heap box stay allocated but unreachable until the end, where the leak warning appears.',
      code: `#include <iostream>
using namespace std;

int main()
{
    int* piNumber2 = new int(42);
    piNumber2 = new int(99);       // the 42 is now unreachable: leaked
    cout << *piNumber2 << endl;
    delete piNumber2;              // frees the 99 only
    piNumber2 = nullptr;
    // fix: delete piNumber2; BEFORE reassigning it
    return 0;
}
`, input: '' },
    { id: 'dyn-dangling', title: 'A dangling pointer (crashes on purpose)', crash: true,
      watch: 'This program crashes on purpose. After delete, p still holds the old address but the box is freed. The last line follows that dangling pointer, which is undefined behavior in real C++.',
      code: `#include <iostream>
using namespace std;

int main()
{
    int* p = new int(7);
    cout << *p << endl;   // 7
    delete p;             // memory returned, but p still holds the address
    *p = 33;              // use after delete: dangling pointer!
    cout << *p << endl;
    return 0;
}
`, input: '' },
    { id: 'dyn-return-pointer', title: 'Returning a pointer from a function',
      watch: 'duplicateArray makes newArray on the heap and returns its address. Its frame disappears, but the heap array survives, and main\'s copy points at it. The caller (main) is the one who deletes it.',
      code: `#include <iostream>
using namespace std;

int* duplicateArray(int* arr, int size)
{
    if (size <= 0)
        return nullptr;
    int* newArray = new int[size];
    for (int index = 0; index < size; index++)
        newArray[index] = arr[index];
    return newArray;
}

int main()
{
    int original[] = {1, 2, 3, 4, 5};
    int* copy = duplicateArray(original, 5);
    copy[0] = 99;                     // the copy is independent
    for (int i = 0; i < 5; i++)
        cout << copy[i] << " ";       // 99 2 3 4 5
    cout << endl;
    cout << original[0] << endl;      // 1
    delete[] copy;                    // the CALLER frees it
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 6
  { section: 6, title: 'Procedural vs. object-oriented', items: [
    { id: 'oop-procedural', title: 'Procedural: data and functions live apart',
      watch: 'studentName and grades belong to main; the functions only receive them as arguments. Nothing stops any function from changing them.',
      code: `#include <iostream>
#include <string>
using namespace std;

const int NUM_GRADES = 3;

double calculateAverage(double grades[], int count)
{
    double sum = 0.0;
    for (int i = 0; i < count; i++)
        sum += grades[i];
    return sum / count;
}

void printStudent(string name, double grades[])
{
    cout << "Student: " << name << endl;
    cout << "Average Grade: " << calculateAverage(grades, NUM_GRADES) << endl;
}

int main()
{
    string studentName = "Alice";
    double grades[NUM_GRADES] = {88.0, 92.0, 79.0};
    printStudent(studentName, grades);
    return 0;
}
`, input: '' },
    { id: 'oop-bankaccount', title: 'OOP: the object owns its data',
      watch: 'balance lives inside account and is private. The only way to change it is through the public functions; watch this point at account each time a method runs.',
      code: `#include <iostream>
using namespace std;

class BankAccount
{
private:
    double balance;          // hidden from outside code
public:
    void setBalance(double amount) { balance = amount; }
    double getBalance()            { return balance; }
    void deposit(double amount)    { balance += amount; }
};

int main()
{
    BankAccount account;
    account.setBalance(100.0);
    account.deposit(50.0);
    cout << account.getBalance() << endl;   // 150
    // account.balance = 999;   // ERROR: balance is private
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 7
  { section: 7, title: 'Building a class step by step', items: [
    { id: 'class-declare-define', title: 'Declaration, then member definitions with ::',
      watch: 'The class lists only prototypes. Each BankAccount:: definition below is attached to the class, which is why it can see balance. Watch deposit and withdraw check the amount before changing balance.',
      code: `#include <iostream>
#include <string>
using namespace std;

class BankAccount                      // Step 1: the declaration
{
private:
    string ownerName;
    double balance;
public:
    void setOwnerName(string);
    void setBalance(double);
    string getOwnerName() const;
    double getBalance() const;
    void deposit(double amount);
    void withdraw(double amount);
};

// Step 2: the member function definitions
void BankAccount::setOwnerName(string on) { ownerName = on; }
void BankAccount::setBalance(double b)    { balance = b; }
string BankAccount::getOwnerName() const  { return ownerName; }
double BankAccount::getBalance() const    { return balance; }

void BankAccount::deposit(double amount)
{
    if (amount <= 0.0)
    {
        cout << "Deposit amount must be positive. Deposit rejected." << endl;
        return;
    }
    balance += amount;
}

void BankAccount::withdraw(double amount)
{
    if (amount > balance)
    {
        cout << "Insufficient funds. Withdrawal rejected." << endl;
        return;
    }
    balance -= amount;
}

int main()                             // Step 3: use an instance
{
    BankAccount acct;
    acct.setOwnerName("Alice Johnson");
    acct.setBalance(500.00);
    acct.deposit(-5.00);
    acct.withdraw(1000.00);
    acct.withdraw(100.00);
    cout << acct.getOwnerName() << ": " << acct.getBalance() << endl;   // 400
    return 0;
}
`, input: '' },
    { id: 'class-instances', title: 'Instances are independent',
      watch: 'acct1 and acct2 are two cookies from one cutter: each has its own ownerName and balance. Watch only acct1 change on the deposit and only acct2 on the withdrawals.',
      code: `#include <iostream>
#include <iomanip>
#include <string>
using namespace std;

class BankAccount
{
private:
    string ownerName;
    double balance;
public:
    void setOwnerName(string on) { ownerName = on; }
    void setBalance(double b)    { balance = b; }
    string getOwnerName() const  { return ownerName; }
    double getBalance() const    { return balance; }
    void deposit(double amount)  { balance += amount; }
    void withdraw(double amount)
    {
        if (amount > balance)
        {
            cout << "Insufficient funds. Withdrawal rejected." << endl;
            return;
        }
        balance -= amount;
    }
};

int main()
{
    BankAccount acct1;
    BankAccount acct2;
    acct1.setOwnerName("Alice Johnson");
    acct1.setBalance(500.00);
    acct2.setOwnerName("Brian Smith");
    acct2.setBalance(150.00);

    acct1.deposit(250.00);     // acct1: 750
    acct2.withdraw(100.00);    // acct2: 50
    acct2.withdraw(1000.00);   // rejected

    cout << fixed << setprecision(2);
    cout << acct1.getOwnerName() << ": $" << acct1.getBalance() << endl;
    cout << acct2.getOwnerName() << ": $" << acct2.getBalance() << endl;
    if (acct1.getBalance() > acct2.getBalance())
        cout << acct1.getOwnerName() << " has the higher balance." << endl;
    else
        cout << acct2.getOwnerName() << " has the higher balance." << endl;
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 8
  { section: 8, title: 'Class tools', items: [
    { id: 'tools-constructors', title: 'Default and parameterized constructors',
      watch: 'Creating account1 jumps into the default constructor automatically; myAccount picks the three-argument one because of its arguments. No setters are needed afterward.',
      code: `#include <iostream>
#include <string>
using namespace std;

class BankAccount
{
private:
    string ownerName;
    string accountNumber;
    double balance;
public:
    BankAccount();                        // default constructor
    BankAccount(string, string, double);  // parameterized constructor
    void print() const
    {
        cout << ownerName << " " << accountNumber << " " << balance << endl;
    }
};

BankAccount::BankAccount()
{
    ownerName = "Unknown";
    accountNumber = "000-000";
    balance = 0.0;
}

BankAccount::BankAccount(string name, string accNum, double initialBalance)
{
    ownerName = name;
    accountNumber = accNum;
    balance = initialBalance;
}

int main()
{
    BankAccount account1;                               // default
    BankAccount myAccount("Jane Doe", "123-456", 500.00);   // parameterized
    account1.print();      // Unknown 000-000 0
    myAccount.print();     // Jane Doe 123-456 500
    return 0;
}
`, input: '' },
    { id: 'tools-this', title: 'The this pointer',
      watch: 'Inside setInfo, the parameter name hides the member name, so this->name reaches the member. Watch this point at dog1 on the first call and dog2 on the second.',
      code: `#include <iostream>
#include <string>
using namespace std;

class Dog
{
private:
    string name;
    int age;
public:
    void setInfo(string name, int age)
    {
        this->name = name;   // left: member, right: parameter
        this->age  = age;
    }
    void printInfo()
    {
        cout << "Name: " << name << ", Age: " << age << endl;
    }
};

int main()
{
    Dog dog1;
    Dog dog2;
    dog1.setInfo("Rex", 3);
    dog2.setInfo("Bella", 5);
    dog1.printInfo();
    dog2.printInfo();
    return 0;
}
`, input: '' },
    { id: 'tools-array-of-objects', title: 'Arrays of objects',
      watch: 'The first two slots are built by the 3-argument constructor; the third gets the default constructor because the list is short. accounts[i].deposit(100) then runs once per object.',
      code: `#include <iostream>
#include <string>
using namespace std;

class BankAccount
{
private:
    string ownerName;
    double balance;
public:
    BankAccount()                          { ownerName = "Unknown"; balance = 0.0; }
    BankAccount(string name, double b)     { ownerName = name; balance = b; }
    void deposit(double amount)            { balance += amount; }
    string getOwnerName() const            { return ownerName; }   // inline
    double getBalance() const              { return balance; }     // inline
};

int main()
{
    BankAccount accounts[3] =
    {
        BankAccount("Alice Johnson", 500.00),
        BankAccount("Bob Smith", 1200.75)
    };                                     // accounts[2] -> default constructor
    for (int i = 0; i < 3; i++)
        accounts[i].deposit(100.00);
    for (int i = 0; i < 3; i++)
        cout << accounts[i].getOwnerName() << ": " << accounts[i].getBalance() << endl;
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 9
  { section: 9, title: 'Classes that own dynamic memory', items: [
    { id: 'own-destructor', title: 'Destructors free what the constructor rented',
      watch: 'The constructor runs new and the heap array appears. When main ends, myList goes out of scope and the destructor runs automatically, freeing the heap array: no leak warning.',
      code: `#include <iostream>
using namespace std;

class NumberList
{
private:
    double* data;
    int capacity;
public:
    NumberList(int cap)
    {
        capacity = cap;
        data = new double[capacity];       // rent heap memory
        cout << "Constructor: rented " << capacity << " slots" << endl;
    }
    ~NumberList()
    {
        delete[] data;                     // return it
        data = nullptr;
        cout << "Destructor: memory returned" << endl;
    }
};

int main()
{
    NumberList myList(3);                  // constructor runs here
    cout << "Using myList..." << endl;
    return 0;
}                                          // destructor runs here
`, input: '' },
    { id: 'own-new-object', title: 'Objects made with new, and ->',
      watch: 'new Book(...) reserves heap space and runs the constructor. (*pBook).printTitle() and pBook->printTitle() do the same thing. delete pBook runs the destructor, then frees the box.',
      code: `#include <iostream>
#include <string>
using namespace std;

class Book
{
private:
    string title;
public:
    Book(string t)     { title = t; cout << "Book created" << endl; }
    ~Book()            { cout << "Book destroyed" << endl; }
    void printTitle()  { cout << "Title: " << title << endl; }
};

int main()
{
    Book* pBook;
    pBook = new Book("Dynamic Memory in C++");   // heap space + constructor
    (*pBook).printTitle();                       // follow pointer, call method
    pBook->printTitle();                         // same thing, with the arrow
    delete pBook;                                // destructor + free memory
    pBook = nullptr;
    return 0;
}
`, input: '' },
    { id: 'own-resize', title: 'Resizing a dynamic array member',
      watch: 'When the list is full, resize rents a bigger heap array, copies count numbers over, deletes the old array, and points data at the new one. Watch the old heap box get freed and capacity double.',
      code: `#include <iostream>
using namespace std;

class NumberList
{
private:
    double* data;
    int count;
    int capacity;
public:
    NumberList(int cap) { capacity = cap; count = 0; data = new double[capacity]; }
    ~NumberList()       { delete[] data; }
    void resize(int newCapacity)
    {
        double* newData = new double[newCapacity];   // 1. bigger array
        for (int i = 0; i < count; i++)              // 2. copy over
            newData[i] = data[i];
        delete[] data;                               // 3. free old
        data = newData;                              //    point at new
        capacity = newCapacity;
    }
    void addNumber(double n)
    {
        if (count == capacity)
            resize(capacity * 2);
        data[count] = n;
        count++;
    }
    void print() const
    {
        for (int i = 0; i < count; i++)
            cout << data[i] << " ";
        cout << "(capacity " << capacity << ")" << endl;
    }
};

int main()
{
    NumberList list(2);
    list.addNumber(1.5);
    list.addNumber(2.5);
    list.addNumber(3.5);     // full: resize to 4 first
    list.print();
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 10
  { section: 10, title: 'Copy constructor: shallow vs. deep copy', items: [
    { id: 'copy-shallow', title: 'Default (shallow) copy: two notes, one house', crash: true,
      watch: 'This program crashes on purpose. object2 = object1 copies the pointer, so both arrows point at the same heap int: writing 13 through object2 changes object1 too. At the end both destructors delete the same memory: a double delete.',
      code: `#include <iostream>
using namespace std;

class IntCell
{
private:
    int* ptrToValue;   // points to an int on the heap
public:
    IntCell(int initialValue)
    {
        ptrToValue = new int;
        *ptrToValue = initialValue;
    }
    ~IntCell() { delete ptrToValue; }
    int read() const   { return *ptrToValue; }
    void write(int x)  { *ptrToValue = x; }
};

int main()
{
    IntCell object1(5);
    IntCell object2 = object1;        // shallow: both point at the same 5
    object2.write(13);                // overwrites the shared value
    cout << object1.read() << endl;   // 13 (surprise!)
    cout << object2.read() << endl;   // 13
    return 0;
}                                     // both destructors run: double delete
`, input: '' },
    { id: 'copy-deep', title: 'Writing a deep copy constructor',
      watch: 'Now the copy constructor runs for object2 and rents its own heap int, copying the VALUE 5. Watch two separate heap boxes: writing 13 leaves object1 alone, and each destructor frees its own box.',
      code: `#include <iostream>
using namespace std;

class IntCell
{
private:
    int* ptrToValue;
public:
    IntCell(int initialValue)
    {
        ptrToValue = new int;
        *ptrToValue = initialValue;
    }
    IntCell(const IntCell& obj)           // deep copy constructor
    {
        ptrToValue = new int;             // own, brand-new memory
        *ptrToValue = *(obj.ptrToValue);  // copy the VALUE, not the address
    }
    ~IntCell() { delete ptrToValue; }
    int read() const   { return *ptrToValue; }
    void write(int x)  { *ptrToValue = x; }
};

int main()
{
    IntCell object1(5);
    IntCell object2 = object1;        // copy constructor runs
    object2.write(13);
    cout << object1.read() << endl;   // 5
    cout << object2.read() << endl;   // 13
    return 0;
}
`, input: '' },
    { id: 'copy-rule-of-three', title: 'When the copy constructor runs (Rule of Three)',
      watch: 'The copy constructor fires for IntCell b = a, for IntCell c(a), and when a is passed by value to show. Count the "copy made" lines. The class also has a destructor; the third member of the Rule of Three, operator=, is not covered yet.',
      code: `#include <iostream>
using namespace std;

class IntCell
{
private:
    int* ptrToValue;
public:
    IntCell(int v)              { ptrToValue = new int(v); }
    IntCell(const IntCell& obj) // 2. copy constructor
    {
        ptrToValue = new int(*obj.ptrToValue);
        cout << "copy made" << endl;
    }
    ~IntCell()                  { delete ptrToValue; }   // 1. destructor
    int read() const            { return *ptrToValue; }
};

void show(IntCell cell)         // pass by value: a copy is made
{
    cout << "show: " << cell.read() << endl;
}

int main()
{
    IntCell a(7);
    IntCell b = a;              // new object from a: copy constructor
    IntCell c(a);               // also the copy constructor
    show(a);                    // pass by value: copy constructor again
    cout << b.read() + c.read() << endl;   // 14
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 11
  { section: 11, title: 'Splitting a class across files', items: [
    { id: 'files-rectangle', title: 'Rectangle.h, Rectangle.cpp and main.cpp',
      watch: 'Shown as one program, but the banners mark the three files. The .h part is the menu (prototypes), the .cpp part is the kitchen (Rectangle:: definitions), and main only uses the public interface.',
      code: `#include <iostream>
using namespace std;

// ---- Rectangle.h ----
// (the real file starts with #ifndef RECTANGLE_H / #define RECTANGLE_H
//  and ends with #endif)
class Rectangle
{
private:
    double width;
    double length;
public:
    void setWidth(double);
    void setLength(double);
    double getArea();
};

// ---- Rectangle.cpp ----
// #include "Rectangle.h"
void Rectangle::setWidth(double w)  { width = w; }
void Rectangle::setLength(double l) { length = l; }
double Rectangle::getArea()         { return width * length; }

// ---- main.cpp ----
// #include <iostream>
// #include "Rectangle.h"
int main()
{
    Rectangle r;
    r.setWidth(5.0);
    r.setLength(3.0);
    cout << "Area: " << r.getArea() << endl;   // Area: 15
    return 0;
}

// Build:  g++ Rectangle.cpp main.cpp -o rect   then   ./rect
`, input: '' },
    { id: 'files-swap-impl', title: 'Swapping the implementation behind the same .h',
      watch: 'The .h promises the same three functions as before, but Rectangle.cpp now validates and stores the area. main.cpp did not change at all. Watch the negative width get rejected.',
      code: `#include <iostream>
using namespace std;

// ---- Rectangle.h ----   (same public prototypes as before)
class Rectangle
{
private:
    double width;
    double length;
public:
    void setWidth(double);
    void setLength(double);
    double getArea();
};

// ---- Rectangle.cpp ----  (new version: validates input)
void Rectangle::setWidth(double w)
{
    if (w < 0)
    {
        cout << "Width can't be negative; using 0" << endl;
        w = 0;
    }
    width = w;
}
void Rectangle::setLength(double l) { length = l; }
double Rectangle::getArea()         { return width * length; }

// ---- main.cpp ----  (unchanged)
int main()
{
    Rectangle r;
    r.setWidth(-5.0);
    r.setLength(3.0);
    cout << "Area: " << r.getArea() << endl;   // Area: 0
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 12
  { section: 12, title: 'Preprocessor, separate compilation, make', items: [
    { id: 'build-include', title: '#include pastes the header in',
      watch: '#include "myfile.h" is replaced by the header\'s text before compiling, so number is a global constant main can use. Change it to 15 and run again to see the "recompile" effect.',
      code: `// ---- myfile.h ----
const int number = 8;

// ---- main.cpp ----
// #include <iostream>
// using namespace std;
// #include "myfile.h"    <- the line above is what this pastes in
#include <iostream>
using namespace std;

int main()
{
    cout << number << endl;   // 8
    return 0;
}

// g++ main.cpp -o include_demo
// ./include_demo
`, input: '' },
    { id: 'build-separate', title: 'Rectangle box(4, 3): separate compilation',
      watch: 'Read the banners as separate files. Rectangle.cpp and Driver.cpp each compile to a .o, then get linked. The comments at the bottom show what make would rebuild after each kind of change.',
      code: `#include <iostream>
using namespace std;

// ---- Rectangle.h ----
// #ifndef RECTANGLE_H   (header guard: skip if already included)
// #define RECTANGLE_H
class Rectangle
{
private:
    double width;
    double height;
public:
    Rectangle(double w, double h);
    double area() const;
};
// #endif

// ---- Rectangle.cpp ----   g++ -c Rectangle.cpp  ->  Rectangle.o
Rectangle::Rectangle(double w, double h) { width = w; height = h; }
double Rectangle::area() const          { return width * height; }

// ---- Driver.cpp ----      g++ -c Driver.cpp     ->  Driver.o
int main()
{
    Rectangle box(4, 3);
    cout << box.area() << endl;   // 12
    return 0;
}

// Link:  g++ Rectangle.o Driver.o -o rectangles
// make:  Driver.cpp changed    -> recompile Driver.cpp, relink
//        Rectangle.h changed   -> recompile BOTH .cpp files, relink
`, input: '' },
  ]},

  // ------------------------------------------------------------------ 13
  { section: 13, title: 'Linux command line', reference: [
    { cmd: 'pwd', what: 'Print working directory: shows where you are', example: 'pwd   ->  /home/codio/workspace' },
    { cmd: 'ls', what: 'List what is in the current folder', example: 'ls' },
    { cmd: 'ls -l', what: 'Long list: permissions, owner, size, date (d = directory, - = file)', example: 'ls -l' },
    { cmd: 'ls -a', what: 'Also show hidden items (names starting with .), plus . and ..', example: 'ls -a' },
    { cmd: 'ls -m', what: 'Comma-separated list', example: 'ls -m' },
    { cmd: 'ls -R', what: 'List this folder and everything inside its subfolders (recursive)', example: 'ls -R' },
    { cmd: 'cd folder', what: 'Move into a folder (relative paths start from where you are)', example: 'cd test' },
    { cmd: 'cd ..', what: 'Move up to the parent folder (does nothing at /)', example: 'cd ../../documents/notes' },
    { cmd: 'cd ~  /  cd', what: 'Go to your home folder', example: 'cd ~/documents/notes' },
    { cmd: 'cat file', what: 'Print a file\'s contents', example: 'cat /etc/os-release' },
    { cmd: 'echo', what: 'Print the text back', example: 'echo "Welcome to Unix"' },
    { cmd: 'man command', what: 'Open the manual for a command (q to quit)', example: 'man bash' },
    { cmd: 'command --version', what: 'Show a program\'s version', example: 'bash --version' },
    { cmd: 'mkdir', what: 'Make one or more folders', example: 'mkdir a b c' },
    { cmd: 'touch', what: 'Make an empty file (or several)', example: 'touch test/file4.txt' },
    { cmd: 'rmdir', what: 'Delete an EMPTY folder only', example: 'rmdir test*' },
    { cmd: 'rm', what: 'Delete files (no trash can: gone for good)', example: 'rm *.obj' },
    { cmd: 'rm -r', what: 'Delete a folder and everything inside it', example: 'rm -r code' },
    { cmd: 'rm -r -i', what: 'Same, but asks before each item', example: 'rm -r -i code' },
    { cmd: '*  ?  [ ]', what: 'Wildcards: any characters / exactly one character / one from a set', example: 'ls *.txt   ls test?   ls test[1-2]' },
    { cmd: 'mv', what: 'Move a file into a folder, or rename it', example: 'mv *.c code   mv old.txt new.txt' },
    { cmd: 'cp', what: 'Copy a file (original stays)', example: 'cp code/*.c backup' },
    { cmd: 'cp -R', what: 'Copy a whole folder and everything in it', example: 'cp -R code code_backup' },
    { cmd: 'tree', what: 'Show folders and files as a tree', example: 'tree' },
    { cmd: 'nano file', what: 'Easy editor: Ctrl+O save, Ctrl+X quit', example: 'nano lab.cpp' },
    { cmd: 'vi file', what: 'vim: i to type, Esc, then :w save, :q quit, :wq both, :q! quit without saving', example: 'vi lab.cpp' },
    { cmd: 'emacs file', what: 'Editor: Ctrl+X Ctrl+S save, Ctrl+X Ctrl+C quit', example: 'emacs lab.cpp' },
    { cmd: 'g++ file.cpp -o name', what: 'Compile into an executable named name (no -o: a.out)', example: 'g++ -Wall lab.cpp -o lab' },
    { cmd: 'g++ -c file.cpp', what: 'Compile only, no link: makes a .o object file', example: 'g++ -c Rectangle.cpp' },
    { cmd: 'g++ a.o b.o -o name', what: 'Link object files into one program', example: 'g++ Rectangle.o Driver.o -o rectangles' },
    { cmd: './program', what: 'Run a program in this folder (./ = look here)', example: './a.out' },
    { cmd: 'make', what: 'Rebuild only what changed, using the makefile rules', example: 'make   make clean' },
    { cmd: 'valgrind --leak-check=full', what: 'Run a program and report leaks and bad memory use', example: 'valgrind --leak-check=full ./program' },
    { cmd: 'ssh user@host', what: 'Log in to another computer (exit or Ctrl+D to leave)', example: 'ssh js108@eros.cs.txstate.edu' },
    { cmd: 'hostname', what: 'Show which machine you are on', example: 'hostname' },
    { cmd: 'scp from to', what: 'Copy files to/from a server (the user@server: side is remote)', example: 'scp myprogram.cpp user@server:/home/user/' },
    { cmd: 'sftp user@host', what: 'Interactive transfer: put uploads, get downloads', example: 'sftp user@server   put file' },
    { cmd: 'Tab / Up / Ctrl+A / Ctrl+E', what: 'Auto-complete names / previous commands / start / end of line', example: 'cd Docu<Tab>' },
  ]},

  // ------------------------------------------------------------------ exam
  { section: 'exam', title: 'Exam 1 walkthrough', items: [
    { id: 'exam-pointers', title: 'Q11 and Q16: what a pointer holds; pointer arithmetic',
      watch: 'Q11: after p1 = p2 (no star), p1 holds y\'s address; *p1 = 20.0 then changes y, not x. Q16: ptr += 2 slides to numbers[2]; *ptr += 5 changes that slot to 35, and *(ptr + 1) is the next element.',
      code: `#include <iostream>
using namespace std;

int main()
{
    // Q11
    double x = 10.2;
    double y = 5.0;
    double* p1 = &x;
    double* p2 = &y;
    *p1 += *p2;        // x = 10.2 + 5.0 = 15.2
    p1 = p2;           // no star: copies the ADDRESS (p1 now points at y)
    *p1 = 20.0;        // star: changes the value AT the address (y)
    cout << x << " " << y << endl;      // 15.2 20
    cout << (p1 == &y) << endl;         // 1: p1 holds y's address

    // Q16
    int numbers[] = {10, 20, 30, 40, 50};
    int* ptr = numbers;   // points at numbers[0]
    ptr += 2;             // moves 2 elements -> numbers[2]
    *ptr += 5;            // numbers[2] = 35
    cout << *ptr << " " << *(ptr + 1) << " " << numbers[2] << endl;   // 35 40 35
    return 0;
}
`, input: '' },
    { id: 'exam-dynamic', title: 'Q12 and Q23: references to pointers; resizeElements',
      watch: 'modifyA gets a copy of arr\'s address, so its new array is leaked and main\'s arr is untouched. modifyB\'s int*& is main\'s arr itself. Then resizeElements builds a bigger array with pointer notation, frees the old one and returns the new address.',
      code: `#include <iostream>
using namespace std;

void modifyA(int* ptr)       // pointer passed BY VALUE
{
    ptr = new int[2];        // only the copy changes; this memory leaks
    ptr[0] = 10;
    ptr[1] = 20;
}

void modifyB(int*& ptr)      // pointer passed BY REFERENCE
{
    delete[] ptr;
    ptr = new int[2];        // main's arr really changes
    ptr[0] = 30;
    ptr[1] = 40;
}

int* resizeElements(int* numbers, int oldSize, int newSize, int fill = 0)
{
    int* result = new int[newSize];
    int copyCount = (oldSize < newSize) ? oldSize : newSize;
    for (int i = 0; i < copyCount; i++)
        *(result + i) = *(numbers + i);
    for (int i = copyCount; i < newSize; i++)
        *(result + i) = fill;
    delete[] numbers;
    return result;
}

int main()
{
    int* arr = new int[2];
    arr[0] = 1;
    arr[1] = 2;
    modifyA(arr);   // arr still points at {1, 2}
    modifyB(arr);   // arr now points at {30, 40}
    cout << arr[0] << " " << arr[1] << endl;   // 30 40

    arr = resizeElements(arr, 2, 4, -1);       // {30, 40, -1, -1}
    for (int i = 0; i < 4; i++)
        cout << arr[i] << " ";
    cout << endl;
    delete[] arr;
    return 0;
}
`, input: '' },
    { id: 'exam-functions', title: 'Q1, Q14 and Q19: loop trace, block scope, defaults',
      watch: 'Q1: i goes 1, 3, then 5 fails i < size - 1, so 65 never prints. Q14: the inner score is a separate box that vanishes at the }. Q19: bar has defaults only on the right, so bar(1) and bar(1, 5) both work.',
      code: `#include <iostream>
using namespace std;

int bar(int a, int b = 2, int c = 3)   // Q19 prototype B: legal
{
    return a + b + c;
}

int main()
{
    // Q1
    int values[] = {10, 25, 30, 45, 50, 65};
    int size = 6;
    for (int i = 1; i < size - 1; i += 2)
        cout << values[i] << " ";      // 25 45
    cout << endl;

    // Q14
    int score = 100;
    if (true)
    {
        int score = 50;
        cout << score << endl;         // 50
    }
    cout << score << endl;             // 100

    // Q19
    cout << bar(1) << " " << bar(1, 5) << " " << bar(1, 5, 10) << endl;   // 6 9 16
    return 0;
}
`, input: '' },
    { id: 'exam-structs', title: 'Q2, Q3 and Q24: structs, array parameters, percentages',
      watch: 'Q2: each p[i].x grows by its own y. Q3: printing data (no brackets) prints an address, not the values. Q24: count * 100.0 / size keeps the decimals; int-only math would give 0.',
      code: `#include <iostream>
#include <string>
using namespace std;

struct Point { int x; int y; };

struct Route { string driver; double miles; };

void process(int data[], int size)     // Q3
{
    cout << data << endl;              // an address, not the values
}

double shortRoutePct(Route list[], int size)   // Q24
{
    if (size == 0)
        return 0.0;
    int count = 0;
    for (int i = 0; i < size; i++)
        if (list[i].miles <= 10.0)
            count++;
    return count * 100.0 / size;       // 100.0 forces decimal division
}

int main()
{
    Point p[3] = {{1, 2}, {3, 4}, {5, 6}};   // Q2
    for (int i = 0; i < 3; i++)
        p[i].x += p[i].y;
    cout << p[0].x << " " << p[2].x << endl;   // 3 11

    int data[3] = {10, 20, 30};
    process(data, 3);

    Route routes[3] = {{"Alice", 18.5}, {"Bob", 8.2}, {"Charlie", 9.6}};
    cout << shortRoutePct(routes, 3) << endl;   // 66.6667
    return 0;
}
`, input: '' },
    { id: 'exam-search-sort', title: 'Q6 and Q21: binary search trace, descending selection sort',
      watch: 'Q6: watch low, high and mid; the compared values are 19, 5, 8, 12 because (0 + 3) / 2 is 1. Q21: in pass 1 maxIndex changes twice and ends at 3 (an index, not the value 8); in pass 2 it never changes, so 6 swaps with itself.',
      code: `#include <iostream>
using namespace std;

int binarySearch(int arr[], int size, int target)
{
    int low = 0, high = size - 1;
    while (low <= high)
    {
        int mid = (low + high) / 2;
        cout << "compare " << arr[mid] << endl;
        if (target == arr[mid])
            return mid;
        else if (target < arr[mid])
            high = mid - 1;
        else
            low = mid + 1;
    }
    return -1;
}

int main()
{
    int sorted[9] = {2, 5, 8, 12, 19, 23, 31, 45, 56};
    int index = binarySearch(sorted, 9, 12);
    cout << "found at " << index << endl;   // 3

    int numbers[5] = {2, 6, 4, 8, 1};
    for (int start = 0; start < 2; start++)      // first two passes
    {
        int maxIndex = start;
        for (int current = start + 1; current < 5; current++)
            if (numbers[current] > numbers[maxIndex])
                maxIndex = current;
        int temp = numbers[start];
        numbers[start] = numbers[maxIndex];
        numbers[maxIndex] = temp;
    }
    for (int i = 0; i < 5; i++)
        cout << numbers[i] << " ";               // 8 6 4 2 1
    cout << endl;
    return 0;
}
`, input: '' },
  ]},

  // ------------------------------------------------------------------ sort
  { section: 'sort', title: 'Selection sort', items: [
    { id: 'sort-selection-desc', title: 'Selection sort (descending, 2 passes)',
      watch: 'Each pass scans from start to the end looking for the largest value; maxIndex remembers WHERE it is. After the inner loop, one swap moves it to position start. Pass 1 puts a 9 first; pass 2 puts the other 9 second.',
      code: `#include <iostream>
using namespace std;

int main()
{
    int v[6] = {4, 9, 4, 7, 9, 1};
    for (int start = 0; start < 2; start++)
    {
        int maxIndex = start;
        for (int i = start + 1; i < 6; i++)
        {
            if (v[i] > v[maxIndex])
            {
                maxIndex = i;
            }
        }
        swap(v[start], v[maxIndex]);
    }
    for (int i = 0; i < 6; i++)
        cout << v[i] << " ";
    cout << endl;
    return 0;
}
`, input: '' },
  ]},
];
