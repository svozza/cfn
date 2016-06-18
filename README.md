# cfn - Simple Cloud Formation for Node.js

## Install
```
$ npm install cfn --save-dev
```

## Usage

```javascript

var cfn = require('cfn');

cfn.config(myAwsConfig);

cfn('Foo-Bar', 'template.js')
    .then(function() {
        console.log('done');
    });
    
cfn('Foo-Bar', 'template.json');

cfn('Foo-Bar', 'template.yml');

cfn({
    name: 'Foo-Bar',
    template: 'template.js',
    createOnly: true,
    quiet: true
});

cfn({
    name: 'Foo-Bar',
    template: 'template.js',
    action: 'create',
    quiet: true
});

cfn.create('Foo-Bar', 'template.js');
cfn.createOrUpdate('Foo-Bar', 'template.js');
cfn.delete('Foo-Bar');

var yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

cfn.cleanup(/\w+-Bar/, yesterday);

```
    
    