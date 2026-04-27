import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('bookray', {

});
