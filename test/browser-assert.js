/* Minimal dependency-free assertion functions for IGAsim browser regression tests. */
function BrowserAssert()
{
    'use strict';
    function fail(message) { throw new Error(message); }
    function inspect(value)
    {
        try { return JSON.stringify(value); }
        catch (_) { return String(value); }
    }
    function deepEqual(a, b, seen = new WeakMap())
    {
        if (Object.is(a, b)) return true;
        if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
        if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false;
        if (seen.get(a) === b) return true;
        seen.set(a, b);
        if (a instanceof Date || b instanceof Date) return a.getTime() === b.getTime();
        if (a instanceof RegExp || b instanceof RegExp) return String(a) === String(b);
        const ak = Object.keys(a), bk = Object.keys(b);
        if (ak.length !== bk.length) return false;
        return ak.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key], seen));
    }
    this.equal = function(actual, expected, message)
    {
        if (!Object.is(actual, expected)) fail(message || `Expected ${inspect(expected)}, received ${inspect(actual)}`);
    };
    this.notEqual = function(actual, expected, message)
    {
        if (Object.is(actual, expected)) fail(message || `Unexpected equality: ${inspect(actual)}`);
    };
    this.ok = function(value, message)
    {
        if (!value) fail(message || `Expected truthy value, received ${inspect(value)}`);
    };
    this.deepEqual = function(actual, expected, message)
    {
        if (!deepEqual(actual, expected)) fail(message || `Deep equality failed: ${inspect(actual)} vs ${inspect(expected)}`);
    };
    this.match = function(actual, pattern, message)
    {
        if (!(pattern instanceof RegExp) || !pattern.test(String(actual)))
            fail(message || `Expected ${inspect(actual)} to match ${pattern}`);
    };
    this.doesNotMatch = function(actual, pattern, message)
    {
        if (!(pattern instanceof RegExp) || pattern.test(String(actual)))
            fail(message || `Expected ${inspect(actual)} not to match ${pattern}`);
    };
    this.throws = function(callback, expected, message)
    {
        let raised;
        try { callback(); }
        catch (error) { raised = error; }
        if (!raised) fail(message || 'Expected function to throw');
        if (expected instanceof RegExp && !expected.test(String(raised.message || raised)))
            fail(message || `Expected thrown message to match ${expected}: ${raised}`);
        return raised;
    };
    this.doesNotThrow = function(callback, message)
    {
        try { callback(); }
        catch (error) { fail(message || `Unexpected exception: ${error.stack || error}`); }
    };
}
var assert = new BrowserAssert();
