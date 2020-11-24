/* eslint-disable import/no-extraneous-dependencies */
import 'jquery-ui/ui/widgets/dialog';
import 'notifyjs-browser';
import View from './View';
import '../../common/binary-ui/dropdown';
import Elevio from '../../common/elevio';
import GTM from '../../common/gtm';
import { isProduction } from '../../common/utils/tools';
import { getTokenList } from '../../common/utils/storageManager';
import { observer as globalObserver } from '../../common/utils/observer';

$.ajaxSetup({
    cache: false,
});

// eslint-disable-next-line no-underscore-dangle
window._trackJs = {
    token      : '346262e7ffef497d85874322fff3bbf8',
    application: 'binary-bot',
    enabled    : isProduction(),
    console    : {
        display: false,
    },
};

// Should stay below the window._trackJs config
require('trackjs');

const loginCheck = () => {
    if (!getTokenList().length) {
        document.location.href = 'index.html';
    }
};

loginCheck();

const view = new View();

view.initPromise.then(() => {
    $('.show-on-load').show();
    $('.barspinner').hide();
    $('#summaryRunButton').click(function(){
        $('#runButton').click();
    });
    $('#summaryStopButton').click(function(){
        $('#stopButton').click();
    });
    $( "#dialog-1" ).dialog({
        autoOpen: false, 
        buttons: {
           OK: function() {
               $(this).dialog("close");
               globalObserver.setState({ Stake: $('#stake_val').val()});
               globalObserver.setState({ SL: $('#sl_val').val()});
               globalObserver.setState({ TP: $('#tp_val').val()});
               globalObserver.setState({ day : $('#day_val').val()});
               globalObserver.setState({ hour : $('#hour_val').val()});
               globalObserver.setState({ minute : $('#minute_val').val()});
               globalObserver.setState({ second : $('#second_val').val()});
            }
        },
        title: "Settings",
        closeText: '',
        classes  : { 'ui-dialog-titlebar-close': 'icon-close' },
        position: {
           my: "center",
           at: "center"
        },
        width: 500,
     });
    $('#settings').click(function() {
        $( "#dialog-1" ).dialog( "open" );
     });
    // $('#summaryRunButton').prop('disable', false);
    window.dispatchEvent(new Event('resize'));
    Elevio.init();
    GTM.init();
    trackJs.configure({
        userId: $('.account-id')
            .first()
            .text(),
    });
});
