import { spawn } from 'node:child_process';

const shell = (command, _args) => {

    const child = spawn(command, _args || [], { stdio: 'inherit', shell: true }); 
    
    child.on('close', (code) => { console.log(`Child process exited with code ${code}`); });
}

export { shell };