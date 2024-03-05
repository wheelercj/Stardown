/*
   Copyright 2024 Chris Wheeler

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

chrome.action.onClicked.addListener(async (tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
            const title = document.title.replaceAll(' ', '');
            const url = location.href;
            navigator.clipboard.writeText(`[${title}](${url})`);
        }
    });

    await brieflyShowCheckmark();
});

async function brieflyShowCheckmark() {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: 'green' });
    await sleep(1000);
    chrome.action.setBadgeText({ text: '' });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
