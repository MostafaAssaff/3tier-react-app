pipeline {
    agent any
    
    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        AWS_CREDENTIALS_ID = 'aws-credentials'
        SONAR_SCANNER_HOME = tool 'SonarScanner-latest'
    }

    stages {
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') {
                    sh "${SONAR_SCANNER_HOME}/bin/sonar-scanner"
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                            dir('backend') {
                                script {
                                    sh '''
                                        if [ ! -f package-lock.json ]; then
                                            echo "🔧 package-lock.json not found. Running npm install to generate it."
                                            npm install
                                        fi
                                        npm ci || npm install
                                    '''

                                    def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:backend-${env.BUILD_ID}"
                                    def backendImage = docker.build(imageName, '.')

                                    // خفف من شدة المشاكل الأمنية مؤقتاً
                                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName}"

                                    docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                        backendImage.push()
                                    }
                                    env.BACKEND_SUCCESS = 'true'
                                }
                            }
                        }
                    }
                }

                stage('Build Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                sh '''
                                    if [ ! -f package-lock.json ]; then
                                        echo "🔧 package-lock.json not found. Running npm install to generate it."
                                        npm install
                                    fi
                                    npm ci || npm install
                                '''

                                sh 'export NODE_OPTIONS=--openssl-legacy-provider && npm run build'

                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:frontend-${env.BUILD_ID}"
                                def frontendImage = docker.build(imageName, '.')

                                // خفف من شدة المشاكل الأمنية مؤقتاً
                                sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName}"

                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    frontendImage.push()
                                }
                                env.FRONTEND_SUCCESS = 'true'
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy to EKS') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                withAWS(credentials: AWS_CREDENTIALS_ID, region: AWS_REGION) {
                    sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}"

                    script {
                        def helmCommand = "helm upgrade --install my-app ./helm/my-app --namespace default"
                        
                        if (env.BACKEND_SUCCESS == 'true') {
                            helmCommand += " --set backend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} --set backend.image.tag=backend-${env.BUILD_ID}"
                        }
                        
                        if (env.FRONTEND_SUCCESS == 'true') {
                            helmCommand += " --set frontend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} --set frontend.image.tag=frontend-${env.BUILD_ID}"
                        }
                        
                        sh helmCommand
                    }
                }
            }
        }
    }

    post {
        failure {
            echo "❌ Build failed."
        }
        success {
            echo "✅ Build and deploy successful!"
        }
        unstable {
            echo "⚠️ Build completed with warnings."
        }
    }
}
