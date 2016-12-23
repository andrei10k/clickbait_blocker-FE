var gulp = require('gulp'),
	watch = require('gulp-watch'),
  uglify = require('gulp-uglify'),
	del = require('del');

gulp.task('compressjs', function () {
	gulp.src('js/development/*.js')
	.pipe(uglify())
	.pipe(gulp.dest('js/build/'));
});

gulp.task('clean', function () {
	return del([
		'js/build/**/*'
	]);
});

gulp.task('watch', function() {
	gulp.watch('js/development/*.js', ['clean', 'compressjs']);
});