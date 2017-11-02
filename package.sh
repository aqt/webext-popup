#!/bin/sh

output="release.zip"

rm $output &> /dev/null

blacklist=$(cat package-ignore.txt)

echo zip -r $output * -x $blacklist
zip -r $output * -x $blacklist
