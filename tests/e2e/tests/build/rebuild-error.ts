import {
  killAllProcesses,
  waitForAnyProcessOutputToMatch,
  execAndWaitForOutputToMatch,
} from '../../utils/process';
import { replaceInFile, readFile, writeFile } from '../../utils/fs';
import { getGlobalVariable } from '../../utils/env';
import { wait } from '../../utils/utils';


const failedRe = /webpack: Failed to compile/;
const successRe = /webpack: Compiled successfully/;
const extraErrors = [
  `Final loader didn't return a Buffer or String`,
  `doesn't contain a valid alias configuration`,
  `main.ts is not part of the TypeScript compilation.`,
];

export default function () {
  if (process.platform.startsWith('win')) {
    return Promise.resolve();
  }
  // Skip this in ejected tests.
  if (getGlobalVariable('argv').eject) {
    return Promise.resolve();
  }

  // Skip in non-nightly tests. Switch this check around when ng5 is out.
  if (!getGlobalVariable('argv').nightly) {
    return Promise.resolve();
  }

  let origContent: string;

  return Promise.resolve()
    // Save the original contents of `./src/app/app.component.ts`.
    .then(() => readFile('./src/app/app.component.ts'))
    .then((contents) => origContent = contents)
    // Add a major error on a non-main file to the initial build.
    .then(() => writeFile('src/app/app.component.ts', ''))
    // Should have an error.
    .then(() => execAndWaitForOutputToMatch('ng', ['serve', '--aot'], failedRe))
    .then((results) => {
      const stderr = results.stderr;
      if (!stderr.includes(`Unexpected value 'AppComponent`)) {
        throw new Error(`Expected static analysis error, got this instead:\n${stderr}`);
      }
      if (extraErrors.some((e) => stderr.includes(e))) {
        throw new Error(`Did not expect extra errors but got:\n${stderr}`);
      }
    })
    // Fix the error, should trigger a successful rebuild.
    .then(() => Promise.all([
      waitForAnyProcessOutputToMatch(successRe, 20000),
      writeFile('src/app/app.component.ts', origContent)
    ]))
    .then(() => wait(2000))
    // Add an syntax error to a non-main file.
    // Build should still be successfull and error reported on forked type checker.
    .then(() => Promise.all([
      waitForAnyProcessOutputToMatch(successRe, 20000),
      writeFile('src/app/app.component.ts', origContent + '\n]]]]]')
    ]))
    .then((results) => {
      const stderr = results[0].stderr;
      if (!stderr.includes('Declaration or statement expected.')) {
        throw new Error(`Expected syntax error, got this instead:\n${stderr}`);
      }
      if (extraErrors.some((e) => stderr.includes(e))) {
        throw new Error(`Did not expect extra errors but got:\n${stderr}`);
      }
    })
    // Fix the error, should trigger a successful rebuild.
    .then(() => Promise.all([
      waitForAnyProcessOutputToMatch(successRe, 20000),
      replaceInFile('src/app/app.component.ts', ']]]]]', '')
    ]))
    .then(() => wait(2000))
    // Add a major error on a rebuild.
    // Should fail the rebuild.
    .then(() => Promise.all([
      waitForAnyProcessOutputToMatch(failedRe, 20000),
      writeFile('src/app/app.component.ts', '')
    ]))
    .then((results) => {
      const stderr = results[0].stderr;
      if (!stderr.includes(`Unexpected value 'AppComponent`)) {
        throw new Error(`Expected static analysis error, got this instead:\n${stderr}`);
      }
      if (extraErrors.some((e) => stderr.includes(e))) {
        throw new Error(`Did not expect extra errors but got:\n${stderr}`);
      }
    })
    // Fix the error, should trigger a successful rebuild.
    .then(() => Promise.all([
      waitForAnyProcessOutputToMatch(successRe, 20000),
      writeFile('src/app/app.component.ts', origContent)
    ]))
    .then(() => killAllProcesses(), (err: any) => {
      killAllProcesses();
      throw err;
    });
}
