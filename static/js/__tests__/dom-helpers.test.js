/**
 * @jest-environment jsdom
 */
const Dom = require('../modules/ui/dom-helpers.js');

describe('dom-helpers', () => {
    test('eventTargetElement returns element nodes unchanged', () => {
        const el = document.createElement('button');
        expect(Dom.eventTargetElement(el)).toBe(el);
    });

    test('eventTargetElement promotes text node to parent element', () => {
        const parent = document.createElement('span');
        const text = document.createTextNode('Go');
        parent.appendChild(text);
        expect(Dom.eventTargetElement(text)).toBe(parent);
    });

    test('eventTargetElement returns null for non-nodes', () => {
        expect(Dom.eventTargetElement(null)).toBeNull();
        expect(Dom.eventTargetElement('x')).toBeNull();
    });

    test('closest finds ancestor from text node target', () => {
        const outer = document.createElement('div');
        outer.className = 'waypoint-item';
        const inner = document.createElement('span');
        const text = document.createTextNode('Stop');
        inner.appendChild(text);
        outer.appendChild(inner);
        document.body.appendChild(outer);
        expect(Dom.closest(text, '.waypoint-item')).toBe(outer);
    });
});
